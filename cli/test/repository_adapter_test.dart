import 'dart:convert';
import 'dart:io';

import 'package:blabla_cli/locale_proposal_adapter.dart';
import 'package:blabla_cli/release_delivery_adapter.dart';
import 'package:crypto/crypto.dart';
import 'package:test/test.dart';

void main() {
  test(
    'refuses a stale Portuguese proposal without changing the checkout',
    () async {
      final fixture = await BrickitFixture.create();
      addTearDown(fixture.dispose);
      final artifact = await portugueseArtifact(fixture);
      final head = await fixture.git(['rev-parse', 'HEAD']);

      await expectLater(
        RepositoryAdapter().deliver(
          requestFor(
            fixture,
            artifact,
            gateway: StaticLocaleProposalGateway(
              artifact,
              deliveryStatus: 'stale',
            ),
          ),
        ),
        throwsA(isA<RepositoryAdapterException>()),
      );

      expect(await fixture.git(['rev-parse', 'HEAD']), head);
      expect(await fixture.git(['branch', '--show-current']), 'develop');
      expect(
        await fixture
            .file('packages/brickit_generated/lib/l10n/intl_pt.arb')
            .exists(),
        isFalse,
      );
    },
  );

  test(
    'rechecks the source snapshot after staging before creating a branch',
    () async {
      final fixture = await BrickitFixture.create();
      addTearDown(fixture.dispose);
      final artifact = await portugueseArtifact(fixture);

      await expectLater(
        RepositoryAdapter().deliver(
          requestFor(
            fixture,
            artifact,
            gateway: SequencedLocaleProposalGateway(
              artifact,
              summaries: [
                LocaleProposalSummary(
                  proposalId: artifact.proposalId,
                  sourceSnapshotId: artifact.sourceSnapshot.id,
                  status: 'ready',
                  deliveryStatus: 'ready',
                ),
                const LocaleProposalSummary(
                  proposalId: 'proposal_pt_123',
                  sourceSnapshotId: 'newer_snapshot',
                  status: 'ready',
                  deliveryStatus: 'ready',
                ),
              ],
            ),
          ),
        ),
        throwsA(isA<RepositoryAdapterException>()),
      );

      expect(await fixture.git(['branch', '--show-current']), 'develop');
      expect(
        await fixture
            .file('packages/brickit_generated/lib/l10n/intl_pt.arb')
            .exists(),
        isFalse,
      );
    },
  );

  test('refuses delivery from a non-integration branch', () async {
    final fixture = await BrickitFixture.create();
    addTearDown(fixture.dispose);
    final artifact = await portugueseArtifact(fixture);
    await fixture.git(['switch', '-c', 'feature/localization']);

    await expectLater(
      RepositoryAdapter().deliver(requestFor(fixture, artifact)),
      throwsA(
        isA<RepositoryAdapterException>().having(
          (error) => error.message,
          'message',
          allOf(contains('feature/localization'), contains('develop')),
        ),
      ),
    );

    expect(
      await fixture.git(['branch', '--show-current']),
      'feature/localization',
    );
    expect(
      await fixture
          .file('packages/brickit_generated/lib/l10n/intl_pt.arb')
          .exists(),
      isFalse,
    );
  });

  test('tells the developer how to fetch a missing source commit', () async {
    final fixture = await BrickitFixture.create();
    addTearDown(fixture.dispose);
    final original = await portugueseArtifact(fixture);
    final artifact = LocaleProposalArtifact(
      version: original.version,
      proposalId: original.proposalId,
      sourceSnapshot: SourceSnapshotIdentity(
        id: original.sourceSnapshot.id,
        repository: original.sourceSnapshot.repository,
        commit: List.filled(40, 'b').join(),
        manifestHash: original.sourceSnapshot.manifestHash,
        catalogPath: original.sourceSnapshot.catalogPath,
      ),
      locale: original.locale,
      catalog: original.catalog,
    );

    await expectLater(
      RepositoryAdapter().deliver(requestFor(fixture, artifact)),
      throwsA(
        isA<RepositoryAdapterException>().having(
          (error) => error.message,
          'message',
          contains('git fetch origin'),
        ),
      ),
    );

    expect(await fixture.git(['branch', '--show-current']), 'develop');
  });

  test('refuses dirty localization files before staging Portuguese', () async {
    final fixture = await BrickitFixture.create();
    addTearDown(fixture.dispose);
    final artifact = await portugueseArtifact(fixture);
    final constants = fixture.file(
      'packages/brickit/lib/constants/locale_const.dart',
    );
    await constants.writeAsString(
      '${await constants.readAsString()}\n// local edit\n',
    );

    await expectLater(
      RepositoryAdapter().deliver(requestFor(fixture, artifact)),
      throwsA(
        isA<RepositoryAdapterException>().having(
          (error) => error.message,
          'message',
          contains('uncommitted localization changes'),
        ),
      ),
    );

    expect(await fixture.git(['branch', '--show-current']), 'develop');
    expect(
      await fixture
          .file('packages/brickit_generated/lib/l10n/intl_pt.arb')
          .exists(),
      isFalse,
    );
  });

  test(
    'refuses a dirty source Catalog Document before staging Portuguese',
    () async {
      final fixture = await BrickitFixture.create();
      addTearDown(fixture.dispose);
      final artifact = await portugueseArtifact(fixture);
      final source = fixture.file(
        'packages/brickit_generated/lib/l10n/intl_en.arb',
      );
      await source.writeAsString('${await source.readAsString()}\n');

      await expectLater(
        RepositoryAdapter().deliver(requestFor(fixture, artifact)),
        throwsA(
          isA<RepositoryAdapterException>().having(
            (error) => error.message,
            'message',
            contains('uncommitted localization changes'),
          ),
        ),
      );

      expect(await fixture.git(['branch', '--show-current']), 'develop');
      expect(
        await fixture
            .file('packages/brickit_generated/lib/l10n/intl_pt.arb')
            .exists(),
        isFalse,
      );
    },
  );

  test(
    'refuses a structurally drifted runtime registration without writing',
    () async {
      final fixture = await BrickitFixture.create();
      addTearDown(fixture.dispose);
      final artifact = await portugueseArtifact(fixture);
      await fixture.commitRuntimeRegistrationDrift();
      final head = await fixture.git(['rev-parse', 'HEAD']);

      await expectLater(
        RepositoryAdapter().deliver(requestFor(fixture, artifact)),
        throwsA(
          isA<RepositoryAdapterException>().having(
            (error) => error.message,
            'message',
            contains('runtime locale registration has drifted'),
          ),
        ),
      );

      expect(await fixture.git(['rev-parse', 'HEAD']), head);
      expect(await fixture.git(['branch', '--show-current']), 'develop');
      expect(
        await fixture
            .file('packages/brickit_generated/lib/l10n/intl_pt.arb')
            .exists(),
        isFalse,
      );
    },
  );

  test('leaves the checkout untouched when Flutter generation fails', () async {
    final fixture = await BrickitFixture.create();
    addTearDown(fixture.dispose);
    final artifact = await portugueseArtifact(fixture);
    final head = await fixture.git(['rev-parse', 'HEAD']);
    final failingFlutter = await fixture.failingFlutter();

    await expectLater(
      RepositoryAdapter().deliver(
        requestFor(fixture, artifact, flutterExecutable: failingFlutter),
      ),
      throwsA(
        isA<RepositoryAdapterException>().having(
          (error) => error.message,
          'message',
          allOf(
            contains('generation failed'),
            contains('Resolved Flutter SDK'),
          ),
        ),
      ),
    );

    expect(await fixture.git(['rev-parse', 'HEAD']), head);
    expect(await fixture.git(['branch', '--show-current']), 'develop');
    expect(
      await fixture
          .file('packages/brickit_generated/lib/l10n/intl_pt.arb')
          .exists(),
      isFalse,
    );
  });

  test('rejects an unexpected generated surface without writing', () async {
    final fixture = await BrickitFixture.create();
    addTearDown(fixture.dispose);
    final artifact = await portugueseArtifact(fixture);
    final unexpectedFlutter = await fixture.unexpectedSurfaceFlutter();

    await expectLater(
      RepositoryAdapter().deliver(
        requestFor(fixture, artifact, flutterExecutable: unexpectedFlutter),
      ),
      throwsA(
        isA<RepositoryAdapterException>().having(
          (error) => error.message,
          'message',
          contains('unexpected surface'),
        ),
      ),
    );

    expect(await fixture.git(['branch', '--show-current']), 'develop');
    expect(
      await fixture
          .file('packages/brickit_generated/lib/l10n/intl_pt.arb')
          .exists(),
      isFalse,
    );
  });

  test(
    'delivers a current Portuguese proposal as one local review branch',
    () async {
      final fixture = await BrickitFixture.create();
      addTearDown(fixture.dispose);

      final catalog = '{"@@locale":"pt","welcome":"Boas-vindas, {name}!"}';
      final artifact = LocaleProposalArtifact(
        version: 1,
        proposalId: 'proposal_pt_123',
        sourceSnapshot: SourceSnapshotIdentity(
          id: 'snapshot_123',
          repository: 'github.com/brickit-app/brickit-flutter',
          commit: fixture.commit,
          manifestHash: List.filled(64, 'a').join(),
          catalogPath: 'packages/brickit_generated/lib/l10n/intl_en.arb',
        ),
        locale: const ProposedLocale(
          code: 'pt',
          label: 'Portuguese',
          runtimeLocale: 'pt-BR',
        ),
        catalog: ProposedCatalog(
          fileName: 'intl_pt.arb',
          content: catalog,
          contentHash: sha256.convert(utf8.encode(catalog)).toString(),
        ),
      );
      final output = StringBuffer();

      final result = await RepositoryAdapter().deliver(
        DeliveryRequest(
          checkout: fixture.root,
          proposalId: artifact.proposalId,
          flutter: testFlutter(fixture.flutterExecutable),
          gateway: StaticLocaleProposalGateway(artifact),
          write: output.writeln,
        ),
      );

      expect(result.branchName, 'blabla/locale-proposal-proposal_pt_123');
      expect(
        result.changedPaths,
        unorderedEquals([
          'packages/brickit_generated/lib/l10n/intl_pt.arb',
          'packages/brickit/lib/constants/locale_const.dart',
          'packages/brickit_generated/lib/l10n/app_localizations.dart',
          'packages/brickit_generated/lib/l10n/app_localizations_pt.dart',
        ]),
      );
      expect(
        await fixture.git(['branch', '--show-current']),
        result.branchName,
      );
      expect(await fixture.git(['status', '--porcelain']), isEmpty);
      final committedPaths = (await fixture.git([
        'diff',
        '--name-only',
        'HEAD^',
        'HEAD',
      ])).split('\n').where((path) => path.isNotEmpty);
      expect(committedPaths, unorderedEquals(result.changedPaths));
      expect(
        await fixture
            .file('packages/brickit_generated/lib/l10n/intl_pt.arb')
            .readAsString(),
        catalog,
      );
      expect(
        await fixture
            .file('packages/brickit/lib/constants/locale_const.dart')
            .readAsString(),
        contains("static const Locale ptLocale = Locale('pt', 'BR');"),
      );
      final generated = await fixture
          .file('packages/brickit_generated/lib/l10n/app_localizations.dart')
          .readAsString();
      expect(generated, contains("case 'pt':"));
      expect(generated, contains('AppLocalizationsPt()'));
      expect(
        fixture
            .file('packages/brickit_generated/lib/l10n/intl_pt_BR.arb')
            .exists(),
        completion(isFalse),
      );
      expect(
        output.toString(),
        allOf(contains('gh pr create'), contains('--base develop')),
      );
    },
  );

  test(
    'delivers reviewed existing-locale values as one local review branch',
    () async {
      final fixture = await BrickitFixture.create();
      addTearDown(fixture.dispose);
      await fixture.addGermanCatalog();
      final baseline = await fixture.git(['rev-parse', 'HEAD']);
      final summary = ReleaseSummary(
        releaseRecord: ReleaseRecordIdentity(
          id: 'release_123',
          projectId: 'project_123',
          baselineSnapshotId: 'snapshot_123',
          repository: 'github.com/brickit-app/brickit-flutter',
          baselineCommit: baseline,
          manifestHash: List.filled(64, 'a').join(),
          integrationBranch: 'develop',
        ),
        catalogs: const [
          BoundCatalog(
            localeCode: 'en',
            catalogPath: 'packages/brickit_generated/lib/l10n/intl_en.arb',
            isSource: true,
          ),
          BoundCatalog(
            localeCode: 'de',
            catalogPath: 'packages/brickit_generated/lib/l10n/intl_de.arb',
            isSource: false,
          ),
        ],
        changeKeyCount: 2,
      );
      final output = StringBuffer();

      final result = await ReleaseRepositoryAdapter().deliver(
        ReleaseDeliveryRequest(
          checkout: fixture.root,
          recordId: summary.releaseRecord.id,
          flutter: testFlutter(fixture.flutterExecutable),
          gateway: StaticReleaseGateway(summary),
          write: output.writeln,
        ),
      );

      expect(result.branchName, 'blabla/release-release_123');
      expect(result.applied, ['greeting']);
      expect(result.skipped.single.messageId, 'farewell');
      expect(
        result.changedPaths,
        unorderedEquals([
          'packages/brickit_generated/lib/l10n/intl_de.arb',
          'packages/brickit_generated/lib/l10n/app_localizations_de.dart',
        ]),
      );
      expect(
        await fixture.git(['branch', '--show-current']),
        result.branchName,
      );
      expect(await fixture.git(['status', '--porcelain']), isEmpty);
      expect(
        await fixture
            .file('packages/brickit_generated/lib/l10n/intl_de.arb')
            .readAsString(),
        '{"@@locale":"de","welcome":"Guten Tag"}',
      );
      expect(
        await fixture.git(['show', '-s', '--format=%B', 'HEAD']),
        allOf(
          contains('Blabla-Release-Record: release_123'),
          contains('Blabla-Baseline-Commit: $baseline'),
          contains('Blabla-Applied-Onto: $baseline'),
          contains('Blabla-Applied-Keys: 1'),
          contains('Blabla-Skipped-Keys: 1'),
        ),
      );
      expect(
        await File(result.pullRequestBodyFile).readAsString(),
        allOf(
          contains('Release Record: `release_123`'),
          contains('`farewell` — `source_changed`'),
        ),
      );
      expect(
        output.toString(),
        allOf(
          contains('Applied 1 key; skipped 1.'),
          contains('Skipped farewell: source_changed.'),
          contains('gh pr create'),
          contains('--body-file'),
        ),
      );
    },
  );
}

Future<LocaleProposalArtifact> portugueseArtifact(
  BrickitFixture fixture,
) async {
  const catalog = '{"@@locale":"pt","welcome":"Boas-vindas, {name}!"}';
  return LocaleProposalArtifact(
    version: 1,
    proposalId: 'proposal_pt_123',
    sourceSnapshot: SourceSnapshotIdentity(
      id: 'snapshot_123',
      repository: 'github.com/brickit-app/brickit-flutter',
      commit: fixture.commit,
      manifestHash: List.filled(64, 'a').join(),
      catalogPath: 'packages/brickit_generated/lib/l10n/intl_en.arb',
    ),
    locale: const ProposedLocale(
      code: 'pt',
      label: 'Portuguese',
      runtimeLocale: 'pt-BR',
    ),
    catalog: ProposedCatalog(
      fileName: 'intl_pt.arb',
      content: catalog,
      contentHash: sha256.convert(utf8.encode(catalog)).toString(),
    ),
  );
}

DeliveryRequest requestFor(
  BrickitFixture fixture,
  LocaleProposalArtifact artifact, {
  LocaleProposalGateway? gateway,
  String? flutterExecutable,
}) => DeliveryRequest(
  checkout: fixture.root,
  proposalId: artifact.proposalId,
  flutter: testFlutter(flutterExecutable ?? fixture.flutterExecutable),
  gateway: gateway ?? StaticLocaleProposalGateway(artifact),
  write: (_) {},
);

ResolvedFlutter testFlutter(String executable) => ResolvedFlutter(
  executable: executable,
  argumentsPrefix: const [],
  sdkPath: executable,
  version: 'test Flutter',
);

class StaticLocaleProposalGateway implements LocaleProposalGateway {
  StaticLocaleProposalGateway(
    this.artifact, {
    this.status = 'ready',
    this.deliveryStatus = 'ready',
  });

  final LocaleProposalArtifact artifact;
  final String status;
  final String deliveryStatus;

  @override
  Future<LocaleProposalSummary> readProposal(String proposalId) async =>
      LocaleProposalSummary(
        proposalId: proposalId,
        sourceSnapshotId: artifact.sourceSnapshot.id,
        status: status,
        deliveryStatus: deliveryStatus,
      );

  @override
  Future<LocaleProposalArtifact> readArtifact(String proposalId) async =>
      artifact;
}

class SequencedLocaleProposalGateway implements LocaleProposalGateway {
  SequencedLocaleProposalGateway(this.artifact, {required this.summaries});

  final LocaleProposalArtifact artifact;
  final List<LocaleProposalSummary> summaries;
  var _summaryReadCount = 0;

  @override
  Future<LocaleProposalSummary> readProposal(String proposalId) async {
    final index = _summaryReadCount < summaries.length
        ? _summaryReadCount
        : summaries.length - 1;
    _summaryReadCount += 1;
    return summaries[index];
  }

  @override
  Future<LocaleProposalArtifact> readArtifact(String proposalId) async =>
      artifact;
}

class StaticReleaseGateway implements ReleaseGateway {
  StaticReleaseGateway(this.summary);

  final ReleaseSummary summary;

  @override
  Future<ReleaseSummary> readRelease(String recordId) async => summary;

  @override
  Future<ReleaseDeliveryTree> createDeliveryTree(
    String recordId,
    List<DeliveryTreeFile> files,
  ) async => ReleaseDeliveryTree(
    releaseRecord: summary.releaseRecord,
    files: files
        .map(
          (file) => file.catalogPath.endsWith('intl_de.arb')
              ? const DeliveryTreeFile(
                  catalogPath:
                      'packages/brickit_generated/lib/l10n/intl_de.arb',
                  content: '{"@@locale":"de","welcome":"Guten Tag"}',
                )
              : file,
        )
        .toList(),
    applied: const ['greeting'],
    skipped: const [
      SkippedReleaseKey(messageId: 'farewell', reason: 'source_changed'),
    ],
  );
}

class BrickitFixture {
  BrickitFixture._({
    required this.root,
    required this.commit,
    required this.flutterExecutable,
  });

  final Directory root;
  final String commit;
  final String flutterExecutable;

  static Future<BrickitFixture> create() async {
    final root = await Directory.systemTemp.createTemp(
      'blabla-brickit-fixture-',
    );
    Future<void> write(String path, String contents) async {
      final file = File('${root.path}${Platform.pathSeparator}$path');
      await file.parent.create(recursive: true);
      await file.writeAsString(contents);
    }

    await write('.gitignore', '.dart_tool/\n');
    await write(
      'packages/brickit_generated/l10n.yaml',
      'arb-dir: lib/l10n\ntemplate-arb-file: intl_en.arb\noutput-localization-file: app_localizations.dart\nsynthetic-package: false\n',
    );
    await write(
      'packages/brickit_generated/lib/l10n/intl_en.arb',
      '{"@@locale":"en","welcome":"Welcome, {name}!"}',
    );
    await write(
      'packages/brickit_generated/lib/l10n/app_localizations.dart',
      '''class AppLocalizations {
  static const supportedLocales = <String>['en'];
}

AppLocalizations lookupAppLocalizations(String languageCode) {
  switch (languageCode) {
    case 'en':
      return AppLocalizations();
  }
  throw StateError('unsupported');
}
''',
    );
    await write(
      'packages/brickit/lib/constants/locale_const.dart',
      '''import 'dart:ui';

class BrickitLocaleConstants {
  static const Locale enLocale = Locale('en', 'US');
  static const Locale frLocale = Locale('fr', 'FR');

  static const List<Locale> supportedLocales = [
    enLocale,
    frLocale,
  ];

  static List<String> supportedLanguageCodes = [
    enLocale.languageCode,
    frLocale.languageCode,
  ];
}
''',
    );
    await write('tools/flutter', '''#!/bin/sh
set -eu
if [ "\$1" != "gen-l10n" ]; then
  exit 2
fi
if [ ! -f lib/l10n/intl_pt.arb ]; then
  if [ ! -f lib/l10n/intl_de.arb ]; then
    exit 0
  fi
  cp lib/l10n/intl_de.arb lib/l10n/app_localizations_de.dart
  exit 0
fi
cat > lib/l10n/app_localizations.dart <<'EOF'
class AppLocalizations {}

class AppLocalizationsPt extends AppLocalizations {}

bool isSupported(String languageCode) => <String>['en', 'pt'].contains(languageCode);

AppLocalizations lookupAppLocalizations(String languageCode) {
  switch (languageCode) {
    case 'en':
      return AppLocalizations();
    case 'pt':
      return AppLocalizationsPt();
  }
  throw StateError('unsupported');
}
EOF
cat > lib/l10n/app_localizations_pt.dart <<'EOF'
class AppLocalizationsPt {}
EOF
''');
    final flutter = File(
      '${root.path}${Platform.pathSeparator}tools${Platform.pathSeparator}flutter',
    );
    final chmod = await Process.run('chmod', ['+x', flutter.path]);
    if (chmod.exitCode != 0) {
      throw StateError(
        'Could not make fake Flutter executable: ${chmod.stderr}',
      );
    }

    Future<String> git(List<String> args) async {
      final result = await Process.run(
        'git',
        args,
        workingDirectory: root.path,
      );
      if (result.exitCode != 0) {
        throw StateError('git ${args.join(' ')} failed: ${result.stderr}');
      }
      return (result.stdout as String).trim();
    }

    await git(['init']);
    await git(['checkout', '-b', 'develop']);
    await git(['config', 'user.name', 'Blabla test']);
    await git(['config', 'user.email', 'blabla@example.test']);
    await git([
      'remote',
      'add',
      'origin',
      'https://github.com/brickit-app/brickit-flutter.git',
    ]);
    await git(['add', '.']);
    await git(['commit', '-m', 'fixture']);
    return BrickitFixture._(
      root: root,
      commit: await git(['rev-parse', 'HEAD']),
      flutterExecutable: flutter.path,
    );
  }

  File file(String relativePath) =>
      File('${root.path}${Platform.pathSeparator}$relativePath');

  Future<String> git(List<String> args) async {
    final result = await Process.run('git', args, workingDirectory: root.path);
    if (result.exitCode != 0) {
      throw StateError('git ${args.join(' ')} failed: ${result.stderr}');
    }
    return (result.stdout as String).trim();
  }

  Future<void> dispose() => root.delete(recursive: true);

  Future<void> commitRuntimeRegistrationDrift() async {
    final constants = file('packages/brickit/lib/constants/locale_const.dart');
    await constants.writeAsString('''import 'dart:ui';

class BrickitLocaleConstants {
  static const Locale enLocale = Locale('en', 'US');
  static const List<Locale> supportedLocales = [enLocale];
  static List<String> supportedLanguageCodes = [enLocale.languageCode];
}
''');
    await git(['add', constants.path]);
    await git(['commit', '-m', 'drift runtime registration']);
  }

  Future<void> addGermanCatalog() async {
    await file(
      'packages/brickit_generated/lib/l10n/intl_de.arb',
    ).writeAsString('{"@@locale":"de","welcome":"Hallo"}');
    final generated = Directory(
      '${root.path}${Platform.pathSeparator}packages${Platform.pathSeparator}brickit_generated',
    );
    final generation = await Process.run(flutterExecutable, [
      'gen-l10n',
    ], workingDirectory: generated.path);
    if (generation.exitCode != 0) {
      throw StateError(
        'Could not generate German fixture: ${generation.stderr}',
      );
    }
    await git(['add', '.']);
    await git(['commit', '-m', 'add German catalog']);
  }

  Future<String> failingFlutter() async {
    final executable = file('tools/flutter-fails-after-candidate');
    await executable.writeAsString('''#!/bin/sh
set -eu
if [ "\$1" != "gen-l10n" ]; then
  exit 2
fi
if [ ! -f lib/l10n/intl_pt.arb ]; then
  exit 0
fi
echo 'generator failed' >&2
exit 1
''');
    final chmod = await Process.run('chmod', ['+x', executable.path]);
    if (chmod.exitCode != 0) {
      throw StateError(
        'Could not make failure Flutter executable: ${chmod.stderr}',
      );
    }
    return executable.path;
  }

  Future<String> unexpectedSurfaceFlutter() async {
    final executable = file('tools/flutter-adds-unexpected-surface');
    await executable.writeAsString('''#!/bin/sh
set -eu
if [ "\$1" != "gen-l10n" ]; then
  exit 2
fi
if [ ! -f lib/l10n/intl_pt.arb ]; then
  exit 0
fi
cat > lib/l10n/app_localizations.dart <<'EOF'
class AppLocalizations {}
class AppLocalizationsPt extends AppLocalizations {}
AppLocalizations lookupAppLocalizations(String languageCode) {
  switch (languageCode) {
    case 'pt':
      return AppLocalizationsPt();
  }
  return AppLocalizations();
}
EOF
cat > lib/l10n/app_localizations_pt.dart <<'EOF'
class AppLocalizationsPt {}
EOF
echo unexpected > lib/l10n/unexpected_generated.dart
''');
    final chmod = await Process.run('chmod', ['+x', executable.path]);
    if (chmod.exitCode != 0) {
      throw StateError(
        'Could not make unexpected-surface Flutter executable: ${chmod.stderr}',
      );
    }
    return executable.path;
  }
}
