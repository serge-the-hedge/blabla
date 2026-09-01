import 'dart:convert';
import 'dart:io';

import 'package:blabla_cli/locale_proposal_adapter.dart';
import 'package:crypto/crypto.dart';
import 'package:test/test.dart';

const _sourceCatalogPath = 'packages/brickit_generated/lib/l10n/intl_en.arb';

void main() {
  final brickitCheckout = Platform.environment['BRICKIT_CHECKOUT'];
  final brickitFlutterSdk = Platform.environment['BRICKIT_FLUTTER_SDK'];
  test(
    'real Flutter generation produces one language-code Portuguese catalog',
    () async {
      final fixture = await _RealBrickitFixture.cloneFrom(brickitCheckout!);
      addTearDown(fixture.dispose);
      final artifact = await fixture.portugueseArtifact();
      final flutter = await FlutterToolchainResolver().resolve(
        fixture.checkout,
        explicitSdk: brickitFlutterSdk,
      );

      final result = await RepositoryAdapter().deliver(
        DeliveryRequest(
          checkout: fixture.checkout,
          proposalId: artifact.proposalId,
          flutter: flutter,
          gateway: _ReadyGateway(artifact),
          write: (_) {},
        ),
      );

      expect(
        result.changedPaths,
        unorderedEquals([
          'packages/brickit_generated/lib/l10n/intl_pt.arb',
          'packages/brickit/lib/constants/locale_const.dart',
          'packages/brickit_generated/lib/l10n/app_localizations.dart',
          'packages/brickit_generated/lib/l10n/app_localizations_pt.dart',
        ]),
      );
      expect(await fixture.git(['status', '--porcelain']), isEmpty);
      expect(
        await fixture
            .file('packages/brickit_generated/lib/l10n/intl_pt_BR.arb')
            .exists(),
        isFalse,
      );
      final generated = await fixture
          .file('packages/brickit_generated/lib/l10n/app_localizations.dart')
          .readAsString();
      expect(generated, contains("case 'pt':"));
      expect(generated, contains('AppLocalizationsPt'));
    },
    skip: brickitCheckout == null
        ? 'Set BRICKIT_CHECKOUT to a Brickit checkout to run the real Flutter acceptance test.'
        : false,
    timeout: const Timeout(Duration(minutes: 2)),
  );
}

class _ReadyGateway implements LocaleProposalGateway {
  _ReadyGateway(this.artifact);

  final LocaleProposalArtifact artifact;

  @override
  Future<LocaleProposalSummary> readProposal(String proposalId) async =>
      LocaleProposalSummary(
        proposalId: proposalId,
        sourceSnapshotId: artifact.sourceSnapshot.id,
        status: 'ready',
        deliveryStatus: 'ready',
      );

  @override
  Future<LocaleProposalArtifact> readArtifact(String proposalId) async =>
      artifact;
}

class _RealBrickitFixture {
  _RealBrickitFixture._({required this.parent, required this.checkout});

  final Directory parent;
  final Directory checkout;

  static Future<_RealBrickitFixture> cloneFrom(String source) async {
    final sourceDirectory = Directory(source);
    if (!await sourceDirectory.exists()) {
      throw StateError('BRICKIT_CHECKOUT does not exist: $source');
    }
    final parent = await Directory.systemTemp.createTemp(
      'blabla-brickit-real-',
    );
    final checkout = Directory(
      '${parent.path}${Platform.pathSeparator}brickit',
    );
    final clone = await Process.run('git', [
      'clone',
      '--shared',
      sourceDirectory.path,
      checkout.path,
    ]);
    if (clone.exitCode != 0) {
      await parent.delete(recursive: true);
      throw StateError('Could not clone Brickit fixture: ${clone.stderr}');
    }
    final fixture = _RealBrickitFixture._(parent: parent, checkout: checkout);
    await fixture.git([
      'remote',
      'set-url',
      'origin',
      'https://github.com/brickit-app/brickit-flutter.git',
    ]);
    // A local clone preserves the source checkout's current branch. Reset the
    // disposable integration branch whether it already exists or not.
    await fixture.git(['switch', '-C', 'develop']);
    await fixture.git(['config', 'user.name', 'Blabla acceptance test']);
    await fixture.git(['config', 'user.email', 'blabla@example.test']);
    return fixture;
  }

  Future<LocaleProposalArtifact> portugueseArtifact() async {
    final source = file(_sourceCatalogPath);
    final decoded = jsonDecode(await source.readAsString());
    if (decoded is! Map)
      throw StateError('Brickit English catalog is not JSON.');
    final catalogDocument = <String, Object?>{};
    for (final entry in decoded.entries) {
      if (entry.key is! String)
        throw StateError('Brickit catalog has a non-string key.');
      catalogDocument[entry.key as String] = entry.value;
    }
    catalogDocument['@@locale'] = 'pt';
    final content = jsonEncode(catalogDocument);
    return LocaleProposalArtifact(
      version: 1,
      proposalId: 'proposal_pt_real_fixture',
      sourceSnapshot: SourceSnapshotIdentity(
        id: 'snapshot_real_fixture',
        repository: 'github.com/brickit-app/brickit-flutter',
        commit: await git(['rev-parse', 'HEAD']),
        manifestHash: List.filled(64, 'a').join(),
        catalogPath: _sourceCatalogPath,
      ),
      locale: const ProposedLocale(
        code: 'pt',
        label: 'Portuguese',
        runtimeLocale: 'pt-BR',
      ),
      catalog: ProposedCatalog(
        fileName: 'intl_pt.arb',
        content: content,
        contentHash: sha256.convert(utf8.encode(content)).toString(),
      ),
    );
  }

  File file(String relativePath) =>
      File('${checkout.path}${Platform.pathSeparator}$relativePath');

  Future<String> git(List<String> arguments) async {
    final result = await Process.run(
      'git',
      arguments,
      workingDirectory: checkout.path,
    );
    if (result.exitCode != 0) {
      throw StateError('git ${arguments.join(' ')} failed: ${result.stderr}');
    }
    return (result.stdout as String).trim();
  }

  Future<void> dispose() => parent.delete(recursive: true);
}
