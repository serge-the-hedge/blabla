import 'dart:io';

import 'command_runner.dart';
import 'flutter_toolchain.dart';
import 'staging_worktree.dart';

export 'command_runner.dart';
export 'flutter_toolchain.dart';

const _l10nDirectory = 'packages/brickit_generated/lib/l10n';
const _l10nConfigPath = 'packages/brickit_generated/l10n.yaml';

class ReleaseRecordIdentity {
  const ReleaseRecordIdentity({
    required this.id,
    required this.projectId,
    required this.baselineSnapshotId,
    required this.repository,
    required this.baselineCommit,
    required this.manifestHash,
    required this.integrationBranch,
  });

  final String id;
  final String projectId;
  final String baselineSnapshotId;
  final String repository;
  final String baselineCommit;
  final String manifestHash;
  final String integrationBranch;
}

class BoundCatalog {
  const BoundCatalog({
    required this.localeCode,
    required this.catalogPath,
    required this.isSource,
  });

  final String localeCode;
  final String catalogPath;
  final bool isSource;
}

class ReleaseSummary {
  const ReleaseSummary({
    required this.releaseRecord,
    required this.catalogs,
    required this.changeKeyCount,
  });

  final ReleaseRecordIdentity releaseRecord;
  final List<BoundCatalog> catalogs;
  final int changeKeyCount;
}

class DeliveryTreeFile {
  const DeliveryTreeFile({required this.catalogPath, required this.content});

  final String catalogPath;
  final String content;
}

class SkippedReleaseKey {
  const SkippedReleaseKey({required this.messageId, required this.reason});

  final String messageId;
  final String reason;
}

class ReleaseDeliveryTree {
  const ReleaseDeliveryTree({
    required this.releaseRecord,
    required this.files,
    required this.applied,
    required this.skipped,
  });

  final ReleaseRecordIdentity releaseRecord;
  final List<DeliveryTreeFile> files;
  final List<String> applied;
  final List<SkippedReleaseKey> skipped;
}

/// The server decides catalog bytes and source-drift policy. The local adapter
/// supplies only the checkout's current bound catalogs.
abstract interface class ReleaseGateway {
  Future<ReleaseSummary> readRelease(String recordId);

  Future<ReleaseDeliveryTree> createDeliveryTree(
    String recordId,
    List<DeliveryTreeFile> files,
  );
}

class ReleaseDeliveryRequest {
  const ReleaseDeliveryRequest({
    required this.checkout,
    required this.recordId,
    required this.flutter,
    required this.gateway,
    required this.write,
  });

  final Directory checkout;
  final String recordId;
  final ResolvedFlutter flutter;
  final ReleaseGateway gateway;
  final void Function(String line) write;
}

class ReleaseDeliveryResult {
  const ReleaseDeliveryResult({
    required this.branchName,
    required this.changedPaths,
    required this.applied,
    required this.skipped,
    required this.pullRequestBodyFile,
    required this.pullRequestCommand,
  });

  final String branchName;
  final List<String> changedPaths;
  final List<String> applied;
  final List<SkippedReleaseKey> skipped;
  final String pullRequestBodyFile;
  final String pullRequestCommand;
}

/// Delivers an immutable Release Bundle into the current integration branch.
/// Source drift skips a complete key on the server; target drift is replaced
/// with the reviewed value. Git and Flutter remain entirely local.
class ReleaseRepositoryAdapter {
  ReleaseRepositoryAdapter({CommandRunner runner = const SystemCommandRunner()})
    : _runner = runner;

  final CommandRunner _runner;

  Future<ReleaseDeliveryResult> deliver(ReleaseDeliveryRequest request) async {
    final summary = await request.gateway.readRelease(request.recordId);
    _validateSummary(summary, request.recordId);

    final checkout = await _repositoryRoot(request.checkout);
    await _ensureReleaseMatchesCheckout(checkout, summary);
    final currentBranch = await _currentBranch(checkout);
    if (currentBranch != summary.releaseRecord.integrationBranch) {
      throw RepositoryAdapterException(
        'This checkout is on $currentBranch, but this release delivers into ${summary.releaseRecord.integrationBranch}. Check out ${summary.releaseRecord.integrationBranch} and retry.',
      );
    }
    await _ensureRelevantPathsAreClean(checkout, summary.catalogs);
    await _ensureIndexIsClean(checkout);
    await _ensureCommitIdentity(checkout);
    final appliedOnto = await _git(checkout, ['rev-parse', 'HEAD']);
    final branchName = 'blabla/release-${summary.releaseRecord.id}';
    await _ensureBranchDoesNotExist(checkout, branchName);

    final staging = await StagingWorktree.create(
      _runner,
      checkout,
      prefix: 'blabla-release-',
    );
    try {
      await _runGenerator(staging.root, request.flutter);
      if ((await _changedPaths(staging.root)).isNotEmpty) {
        throw RepositoryAdapterException(
          'Flutter localization output is already drifted in this checkout. Regenerate and commit it before delivering this release. ${request.flutter.description}',
        );
      }
      final generatedBefore = (await _gitLines(staging.root, [
        'ls-files',
        '--',
        '$_l10nDirectory/*.dart',
      ])).toSet();
      final inputFiles = await _readBoundCatalogs(
        staging.root,
        summary.catalogs,
      );
      final delivery = await request.gateway.createDeliveryTree(
        request.recordId,
        inputFiles,
      );
      _validateDelivery(summary, delivery);
      if (delivery.applied.isEmpty) {
        final detail = delivery.skipped.isEmpty
            ? 'The Release Bundle contains no applicable catalog changes.'
            : 'Every release key was skipped because its Source Contract changed or disappeared.';
        throw RepositoryAdapterException(
          '$detail No review branch was created.',
        );
      }

      await _writeDeliveryTree(staging.root, delivery.files);
      await _runGenerator(staging.root, request.flutter);
      final changedPaths = await _verifiedCandidatePaths(
        staging.root,
        summary,
        delivery,
        generatedBefore,
        request.flutter,
      );
      final candidateFiles = await _readCandidateFiles(
        staging.root,
        changedPaths,
      );

      await _ensureRelevantPathsAreClean(checkout, summary.catalogs);
      await _ensureIndexIsClean(checkout);
      if (await _git(checkout, ['rev-parse', 'HEAD']) != appliedOnto) {
        throw RepositoryAdapterException(
          'The Brickit checkout advanced while the release was being prepared. Retry from the new integration-branch HEAD.',
        );
      }
      final current = await request.gateway.readRelease(request.recordId);
      _validateSameRelease(summary, current);

      await _git(checkout, ['switch', '-c', branchName]);
      await _writeCandidateFiles(checkout, candidateFiles);
      await _git(checkout, ['add', '--', ...changedPaths]);
      final stagedPaths = await _gitLines(checkout, [
        'diff',
        '--cached',
        '--name-only',
      ]);
      if (!_sameSet(stagedPaths.toSet(), changedPaths.toSet())) {
        throw RepositoryAdapterException(
          'The local Git index changed while the release was being prepared. No commit was created.',
        );
      }
      await _git(checkout, [
        'commit',
        '-m',
        'fix(l10n): deliver reviewed translations\n\nBlabla-Release-Record: ${summary.releaseRecord.id}\nBlabla-Baseline-Commit: ${summary.releaseRecord.baselineCommit}\nBlabla-Applied-Onto: $appliedOnto\nBlabla-Applied-Keys: ${delivery.applied.length}\nBlabla-Skipped-Keys: ${delivery.skipped.length}',
      ]);

      final body = _pullRequestBody(summary, delivery, appliedOnto);
      final pullRequestBodyFile = await _writePullRequestBody(
        checkout,
        summary.releaseRecord.id,
        body,
      );
      final pullRequestCommand =
          'gh pr create --base ${summary.releaseRecord.integrationBranch} --head $branchName --title "fix(l10n): deliver reviewed translations" --body-file ${_shellQuote(pullRequestBodyFile)}';
      request.write('Created local branch $branchName.');
      request.write(
        'Applied ${delivery.applied.length} key${delivery.applied.length == 1 ? '' : 's'}; skipped ${delivery.skipped.length}.',
      );
      for (final skipped in delivery.skipped) {
        request.write('Skipped ${skipped.messageId}: ${skipped.reason}.');
      }
      request.write('Review it, then run: git push -u origin $branchName');
      request.write(pullRequestCommand);
      return ReleaseDeliveryResult(
        branchName: branchName,
        changedPaths: changedPaths,
        applied: delivery.applied,
        skipped: delivery.skipped,
        pullRequestBodyFile: pullRequestBodyFile,
        pullRequestCommand: pullRequestCommand,
      );
    } finally {
      await staging.dispose();
    }
  }

  void _validateSummary(ReleaseSummary summary, String recordId) {
    final record = summary.releaseRecord;
    final paths = summary.catalogs
        .map((catalog) => catalog.catalogPath)
        .toSet();
    if (record.id != recordId ||
        !RegExp(r'^[A-Za-z0-9_-]{1,128}$').hasMatch(record.id) ||
        summary.changeKeyCount < 0 ||
        summary.catalogs.isEmpty ||
        summary.catalogs.length > 20 ||
        paths.length != summary.catalogs.length ||
        summary.catalogs.where((catalog) => catalog.isSource).length != 1 ||
        summary.catalogs.any(
          (catalog) =>
              catalog.localeCode.isEmpty ||
              !_isSafeRelativePath(catalog.catalogPath),
        ) ||
        !_isValidIntegrationBranch(record.integrationBranch) ||
        !RegExp(
          r'^[0-9a-f]{7,64}$',
          caseSensitive: false,
        ).hasMatch(record.baselineCommit) ||
        !RegExp(
          r'^[0-9a-f]{64}$',
          caseSensitive: false,
        ).hasMatch(record.manifestHash)) {
      throw RepositoryAdapterException(
        'Blabla returned an invalid existing-locale Release Bundle summary.',
      );
    }
  }

  void _validateDelivery(ReleaseSummary summary, ReleaseDeliveryTree delivery) {
    _validateSameRelease(
      summary,
      ReleaseSummary(
        releaseRecord: delivery.releaseRecord,
        catalogs: summary.catalogs,
        changeKeyCount: summary.changeKeyCount,
      ),
    );
    final expectedPaths = summary.catalogs
        .map((catalog) => catalog.catalogPath)
        .toSet();
    final actualPaths = delivery.files.map((file) => file.catalogPath).toSet();
    if (!_sameSet(expectedPaths, actualPaths) ||
        delivery.files.length != actualPaths.length ||
        delivery.applied.toSet().length != delivery.applied.length ||
        delivery.skipped.map((key) => key.messageId).toSet().length !=
            delivery.skipped.length ||
        delivery.skipped.any(
          (key) =>
              key.reason != 'missing_source' && key.reason != 'source_changed',
        )) {
      throw RepositoryAdapterException(
        'Blabla returned an invalid existing-locale delivery tree.',
      );
    }
  }

  void _validateSameRelease(ReleaseSummary expected, ReleaseSummary actual) {
    final left = expected.releaseRecord;
    final right = actual.releaseRecord;
    if (left.id != right.id ||
        left.projectId != right.projectId ||
        left.baselineSnapshotId != right.baselineSnapshotId ||
        left.repository != right.repository ||
        left.baselineCommit != right.baselineCommit ||
        left.manifestHash != right.manifestHash ||
        left.integrationBranch != right.integrationBranch) {
      throw RepositoryAdapterException(
        'The Release Bundle changed while delivery was being prepared.',
      );
    }
  }

  Future<Directory> _repositoryRoot(Directory checkout) async {
    if (!await checkout.exists()) {
      throw RepositoryAdapterException('Brickit checkout does not exist.');
    }
    return Directory(await _git(checkout, ['rev-parse', '--show-toplevel']));
  }

  Future<void> _ensureReleaseMatchesCheckout(
    Directory checkout,
    ReleaseSummary summary,
  ) async {
    final remote = await _git(checkout, [
      'remote',
      'get-url',
      '--all',
      'origin',
    ]);
    final expected = _normalizeRepository(summary.releaseRecord.repository);
    final remotes = remote
        .split('\n')
        .where((value) => value.trim().isNotEmpty)
        .map(_normalizeRepository)
        .toSet();
    if (!remotes.contains(expected)) {
      throw RepositoryAdapterException(
        'The release belongs to ${summary.releaseRecord.repository}, not this checkout.',
      );
    }
    final commit = summary.releaseRecord.baselineCommit;
    final result = await _run(checkout, 'git', [
      'cat-file',
      '-e',
      '$commit^{commit}',
    ]);
    if (result.exitCode != 0) {
      throw RepositoryAdapterException(
        'The release baseline $commit is not available in this checkout. Run `git fetch origin $commit` and retry.',
      );
    }
    for (final catalog in summary.catalogs) {
      if (!await _file(checkout, catalog.catalogPath).exists()) {
        throw RepositoryAdapterException(
          'Brickit is missing the bound Catalog Document ${catalog.catalogPath}.',
        );
      }
    }
  }

  String _normalizeRepository(String value) {
    var normalized = value.trim().replaceFirst(RegExp(r'^[a-z]+://'), '');
    normalized = normalized.replaceFirst(RegExp(r'^[^@]+@'), '');
    normalized = normalized.replaceFirst(':', '/');
    normalized = normalized.replaceFirst(RegExp(r'^/+'), '');
    normalized = normalized.replaceFirst(RegExp(r'\.git/?$'), '');
    return normalized.toLowerCase();
  }

  Future<void> _ensureRelevantPathsAreClean(
    Directory checkout,
    List<BoundCatalog> catalogs,
  ) async {
    final paths = {
      _l10nDirectory,
      _l10nConfigPath,
      ...catalogs.map((catalog) => catalog.catalogPath),
    };
    final output = await _git(checkout, [
      'status',
      '--porcelain',
      '--',
      ...paths,
    ]);
    if (output.isNotEmpty) {
      throw RepositoryAdapterException(
        'Brickit has uncommitted localization changes. Commit or stash them before delivering this release.',
      );
    }
  }

  Future<void> _ensureIndexIsClean(Directory checkout) async {
    final result = await _run(checkout, 'git', ['diff', '--cached', '--quiet']);
    if (result.exitCode == 0) return;
    if (result.exitCode == 1) {
      throw RepositoryAdapterException(
        'Brickit has staged changes. Commit or unstage them before creating a release review branch.',
      );
    }
    throw _commandFailure('git diff --cached --quiet', result);
  }

  Future<void> _ensureCommitIdentity(Directory checkout) async {
    for (final key in ['user.name', 'user.email']) {
      final result = await _run(checkout, 'git', ['config', '--get', key]);
      if (result.exitCode != 0 || result.stdout.trim().isEmpty) {
        throw RepositoryAdapterException(
          'Git $key must be configured before creating a release review branch.',
        );
      }
    }
  }

  Future<String> _currentBranch(Directory checkout) async {
    final branch = await _git(checkout, ['branch', '--show-current']);
    if (branch.isEmpty) {
      throw RepositoryAdapterException(
        'Brickit is detached at HEAD. Check out the integration branch first.',
      );
    }
    return branch;
  }

  Future<void> _ensureBranchDoesNotExist(
    Directory checkout,
    String branchName,
  ) async {
    final result = await _run(checkout, 'git', [
      'show-ref',
      '--verify',
      '--quiet',
      'refs/heads/$branchName',
    ]);
    if (result.exitCode == 1) return;
    if (result.exitCode == 0) {
      throw RepositoryAdapterException(
        'Local branch $branchName already exists. Review or remove it before retrying.',
      );
    }
    throw _commandFailure('git show-ref', result);
  }

  Future<void> _runGenerator(
    Directory checkout,
    ResolvedFlutter flutter,
  ) async {
    final package = Directory(
      '${checkout.path}${Platform.pathSeparator}packages${Platform.pathSeparator}brickit_generated',
    );
    if (!await File(
      '${package.path}${Platform.pathSeparator}l10n.yaml',
    ).exists()) {
      throw RepositoryAdapterException(
        'Brickit no longer has the expected packages/brickit_generated/l10n.yaml localization shape.',
      );
    }
    final result = await _run(package, flutter.executable, [
      ...flutter.argumentsPrefix,
      'gen-l10n',
    ]);
    if (result.exitCode != 0) {
      throw RepositoryAdapterException(
        'Flutter localization generation failed before the Brickit checkout was changed. ${flutter.description}. ${_failureDetail(result)}',
      );
    }
  }

  Future<List<DeliveryTreeFile>> _readBoundCatalogs(
    Directory checkout,
    List<BoundCatalog> catalogs,
  ) async {
    final files = <DeliveryTreeFile>[];
    for (final catalog in catalogs) {
      files.add(
        DeliveryTreeFile(
          catalogPath: catalog.catalogPath,
          content: await _file(checkout, catalog.catalogPath).readAsString(),
        ),
      );
    }
    return files;
  }

  Future<void> _writeDeliveryTree(
    Directory checkout,
    List<DeliveryTreeFile> files,
  ) async {
    for (final file in files) {
      await _file(
        checkout,
        file.catalogPath,
      ).writeAsString(file.content, flush: true);
    }
  }

  Future<List<String>> _verifiedCandidatePaths(
    Directory staging,
    ReleaseSummary summary,
    ReleaseDeliveryTree delivery,
    Set<String> generatedBefore,
    ResolvedFlutter flutter,
  ) async {
    final changed = await _changedPaths(staging);
    final catalogPaths = summary.catalogs
        .map((catalog) => catalog.catalogPath)
        .toSet();
    final allowed = {...catalogPaths, ...generatedBefore};
    if (changed.isEmpty || !allowed.containsAll(changed)) {
      throw RepositoryAdapterException(
        'Flutter generation changed an unexpected surface. Refusing to write the checkout. ${flutter.description}',
      );
    }
    if (!changed.any(catalogPaths.contains)) {
      throw RepositoryAdapterException(
        'The Release Bundle applied no catalog-byte change. No review branch was created.',
      );
    }
    for (final expected in delivery.files) {
      if (await _file(staging, expected.catalogPath).readAsString() !=
          expected.content) {
        throw RepositoryAdapterException(
          'Flutter generation rewrote ${expected.catalogPath} after Blabla authored it.',
        );
      }
    }
    return changed.toList()..sort();
  }

  Future<Set<String>> _changedPaths(Directory checkout) async {
    final tracked = await _gitLines(checkout, ['diff', '--name-only']);
    final untracked = await _gitLines(checkout, [
      'ls-files',
      '--others',
      '--exclude-standard',
    ]);
    return {...tracked, ...untracked};
  }

  Future<Map<String, List<int>>> _readCandidateFiles(
    Directory checkout,
    List<String> paths,
  ) async {
    final files = <String, List<int>>{};
    for (final path in paths) {
      files[path] = await _file(checkout, path).readAsBytes();
    }
    return files;
  }

  Future<void> _writeCandidateFiles(
    Directory checkout,
    Map<String, List<int>> files,
  ) async {
    for (final entry in files.entries) {
      final destination = _file(checkout, entry.key);
      await destination.parent.create(recursive: true);
      await destination.writeAsBytes(entry.value, flush: true);
    }
  }

  String _pullRequestBody(
    ReleaseSummary summary,
    ReleaseDeliveryTree delivery,
    String appliedOnto,
  ) {
    final skipped = delivery.skipped.isEmpty
        ? '- None'
        : delivery.skipped
              .map((key) => '- `${key.messageId}` — `${key.reason}`')
              .join('\n');
    return '''Delivers reviewed Blabla translations.

- Release Record: `${summary.releaseRecord.id}`
- Baseline: `${summary.releaseRecord.baselineCommit}`
- Applied onto: `$appliedOnto`
- Applied keys: ${delivery.applied.length}

Skipped keys

$skipped''';
  }

  Future<String> _writePullRequestBody(
    Directory checkout,
    String recordId,
    String body,
  ) async {
    final gitPath = await _git(checkout, [
      'rev-parse',
      '--git-path',
      'blabla/release-$recordId-pr.md',
    ]);
    final file = File(gitPath).isAbsolute
        ? File(gitPath)
        : File('${checkout.path}${Platform.pathSeparator}$gitPath');
    await file.parent.create(recursive: true);
    await file.writeAsString(body, flush: true);
    return file.absolute.path;
  }

  String _shellQuote(String value) => "'${value.replaceAll("'", "'\\''")}'";

  bool _isSafeRelativePath(String path) =>
      path.isNotEmpty &&
      !path.startsWith('/') &&
      !path.contains('\\') &&
      !path.split('/').contains('..') &&
      !path.split('/').contains('.') &&
      !path.contains('//');

  File _file(Directory root, String relativePath) => File(
    '${root.path}${Platform.pathSeparator}${relativePath.replaceAll('/', Platform.pathSeparator)}',
  );

  Future<String> _git(Directory checkout, List<String> arguments) async {
    final result = await _run(checkout, 'git', arguments);
    if (result.exitCode != 0) {
      throw _commandFailure('git ${arguments.join(' ')}', result);
    }
    return result.stdout.trim();
  }

  Future<List<String>> _gitLines(
    Directory checkout,
    List<String> arguments,
  ) async {
    final output = await _git(checkout, arguments);
    if (output.isEmpty) return const [];
    return output.split('\n').where((line) => line.isNotEmpty).toList();
  }

  Future<CommandResult> _run(
    Directory checkout,
    String executable,
    List<String> arguments,
  ) => _runner.run(executable, arguments, workingDirectory: checkout.path);

  RepositoryAdapterException _commandFailure(
    String command,
    CommandResult result,
  ) => RepositoryAdapterException('$command failed. ${_failureDetail(result)}');

  String _failureDetail(CommandResult result) {
    final detail = result.stderr.trim().isNotEmpty
        ? result.stderr.trim()
        : result.stdout.trim();
    return detail.isEmpty ? 'Exit code ${result.exitCode}.' : detail;
  }

  bool _sameSet(Set<String> left, Set<String> right) =>
      left.length == right.length && left.containsAll(right);
}

bool _isValidIntegrationBranch(String branch) {
  return branch.length <= 128 &&
      RegExp(r'^[A-Za-z0-9][A-Za-z0-9._/-]*$').hasMatch(branch) &&
      !branch.contains('..') &&
      !branch.contains('//') &&
      !branch.contains('/.') &&
      !branch.contains('@{') &&
      !branch.endsWith('/') &&
      !branch.endsWith('.') &&
      !branch.endsWith('.lock');
}
