import 'dart:io';

import 'package:blabla_cli/credentials.dart';
import 'package:blabla_cli/locale_proposal_adapter.dart';
import 'package:test/test.dart';

void main() {
  test('stores credentials outside a checkout at mode 0600', () async {
    final home = await Directory.systemTemp.createTemp('blabla-credentials-');
    addTearDown(() => home.delete(recursive: true));
    final store = CredentialStore(homeDirectory: home);

    await store.write(
      const BlablaCredentials(
        server: 'https://blabla.example',
        token: 'token-value',
      ),
    );

    expect((await store.file.stat()).mode & 63, 0);
    final credentials = await store.read();
    expect(credentials?.server, 'https://blabla.example');
    expect(credentials?.token, 'token-value');

    await store.write(
      const BlablaCredentials(
        server: 'https://next-blabla.example',
        token: 'replacement-token',
      ),
    );
    expect((await store.read())?.token, 'replacement-token');
  });

  test('refuses credentials made readable by another user', () async {
    final home = await Directory.systemTemp.createTemp('blabla-credentials-');
    addTearDown(() => home.delete(recursive: true));
    final store = CredentialStore(homeDirectory: home);
    await store.file.parent.create(recursive: true);
    await store.file.writeAsString(
      '{"server":"https://blabla.example","token":"token-value"}',
    );
    final chmod = await Process.run('chmod', ['644', store.file.path]);
    if (chmod.exitCode != 0) throw StateError('Could not set credential mode.');

    await expectLater(store.read(), throwsA(isA<RepositoryAdapterException>()));
  });
}
