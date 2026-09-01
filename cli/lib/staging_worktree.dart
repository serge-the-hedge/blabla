import 'dart:io';

import 'command_runner.dart';

/// A detached, disposable checkout used to prove a localization delivery
/// before any bytes are copied into the developer's working tree.
class StagingWorktree {
  StagingWorktree._({
    required this.runner,
    required this.checkout,
    required this.root,
    required this.parent,
  });

  final CommandRunner runner;
  final Directory checkout;
  final Directory root;
  final Directory parent;

  static Future<StagingWorktree> create(
    CommandRunner runner,
    Directory checkout, {
    String prefix = 'blabla-delivery-',
  }) async {
    final parent = await Directory.systemTemp.createTemp(prefix);
    final root = Directory('${parent.path}${Platform.pathSeparator}checkout');
    try {
      final result = await runner.run('git', [
        'worktree',
        'add',
        '--detach',
        root.path,
        'HEAD',
      ], workingDirectory: checkout.path);
      if (result.exitCode != 0) {
        throw RepositoryAdapterException(
          'Could not create a disposable Brickit worktree. ${result.stderr.trim()}',
        );
      }
      return StagingWorktree._(
        runner: runner,
        checkout: checkout,
        root: root,
        parent: parent,
      );
    } catch (_) {
      await parent.delete(recursive: true);
      rethrow;
    }
  }

  Future<void> dispose() async {
    try {
      await runner.run('git', [
        'worktree',
        'remove',
        '--force',
        root.path,
      ], workingDirectory: checkout.path);
    } finally {
      if (await parent.exists()) await parent.delete(recursive: true);
    }
  }
}
