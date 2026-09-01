import 'dart:convert';
import 'dart:io';

import 'package:blabla_cli/cli_version.dart';
import 'package:blabla_cli/release_api_gateway.dart';
import 'package:blabla_cli/release_delivery_adapter.dart';
import 'package:test/test.dart';

void main() {
  test('reads a release and submits the current delivery tree', () async {
    const recordId = 'release_123';
    const token = 'export-token';
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(server.close);
    final methods = <String>[];
    server.listen((request) async {
      expect(
        request.headers.value(HttpHeaders.authorizationHeader),
        'Bearer $token',
      );
      expect(request.headers.value('x-blabla-cli-version'), blablaCliVersion);
      expect(
        request.headers.value('x-blabla-cli-protocol'),
        '$blablaCliProtocol',
      );
      methods.add('${request.method} ${request.uri.path}');
      request.response.headers.contentType = ContentType.json;
      final record = {
        'id': recordId,
        'projectId': 'project_123',
        'baselineSnapshotId': 'snapshot_123',
        'repository': 'github.com/brickit-app/brickit-flutter',
        'baselineCommit': List.filled(40, 'a').join(),
        'manifestHash': List.filled(64, 'b').join(),
        'integrationBranch': 'develop',
      };
      if (request.method == 'GET') {
        request.response.write(
          jsonEncode({
            'releaseRecord': record,
            'catalogs': [
              {
                'localeCode': 'en',
                'catalogPath': 'intl_en.arb',
                'isSource': true,
              },
              {
                'localeCode': 'de',
                'catalogPath': 'intl_de.arb',
                'isSource': false,
              },
            ],
            'changeKeyCount': 1,
          }),
        );
      } else {
        final body = jsonDecode(await utf8.decoder.bind(request).join()) as Map;
        expect(body['files'], hasLength(2));
        request.response.write(
          jsonEncode({
            'releaseRecord': record,
            'files': [
              {
                'catalogPath': 'intl_en.arb',
                'content': '{"@@locale":"en","welcome":"Hello"}',
              },
              {
                'catalogPath': 'intl_de.arb',
                'content': '{"@@locale":"de","welcome":"Guten Tag"}',
              },
            ],
            'applied': ['welcome'],
            'skipped': [
              {'messageId': 'stale', 'reason': 'source_changed'},
            ],
          }),
        );
      }
      await request.response.close();
    });

    final gateway = HttpReleaseGateway(
      baseUrl: Uri.parse('http://${server.address.address}:${server.port}'),
      token: token,
    );
    final summary = await gateway.readRelease(recordId);
    final delivery = await gateway.createDeliveryTree(recordId, const [
      DeliveryTreeFile(
        catalogPath: 'intl_en.arb',
        content: '{"@@locale":"en","welcome":"Hello"}',
      ),
      DeliveryTreeFile(
        catalogPath: 'intl_de.arb',
        content: '{"@@locale":"de","welcome":"Hallo"}',
      ),
    ]);

    expect(summary.changeKeyCount, 1);
    expect(summary.releaseRecord.integrationBranch, 'develop');
    expect(delivery.applied, ['welcome']);
    expect(delivery.skipped.single.reason, 'source_changed');
    expect(methods, [
      'GET /api/repository-adapter/v1/releases/$recordId',
      'POST /api/repository-adapter/v1/releases/$recordId/delivery-tree',
    ]);
  });

  test('translates a schema-invalid success response', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(server.close);
    server.listen((request) async {
      request.response.headers.contentType = ContentType.json;
      request.response.write(
        '{"releaseRecord":{},"catalogs":[null],"changeKeyCount":1}',
      );
      await request.response.close();
    });
    final gateway = HttpReleaseGateway(
      baseUrl: Uri.parse('http://${server.address.address}:${server.port}'),
      token: 'token',
    );

    await expectLater(
      gateway.readRelease('release_123'),
      throwsA(
        isA<RepositoryAdapterException>().having(
          (error) => error.message,
          'message',
          contains('invalid existing-locale release response'),
        ),
      ),
    );
  });
}
