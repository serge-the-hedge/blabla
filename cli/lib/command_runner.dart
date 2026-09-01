import 'dart:io';

/// An error the command can show directly to the developer without exposing an
/// implementation detail such as a token or a temporary worktree path.
class RepositoryAdapterException implements Exception {
  RepositoryAdapterException(this.message);

  final String message;

  @override
  String toString() => message;
}

class CommandResult {
  const CommandResult({
    required this.exitCode,
    required this.stdout,
    required this.stderr,
  });

  final int exitCode;
  final String stdout;
  final String stderr;
}

/// The small process boundary shared by the local toolchain and Git adapter.
/// Tests replace it only where command selection is the behavior under test.
abstract interface class CommandRunner {
  Future<CommandResult> run(
    String executable,
    List<String> arguments, {
    required String workingDirectory,
    List<int>? stdin,
  });
}

class SystemCommandRunner implements CommandRunner {
  const SystemCommandRunner();

  @override
  Future<CommandResult> run(
    String executable,
    List<String> arguments, {
    required String workingDirectory,
    List<int>? stdin,
  }) async {
    try {
      if (stdin != null) {
        final process = await Process.start(
          executable,
          arguments,
          workingDirectory: workingDirectory,
          runInShell: false,
        );
        final stdout = process.stdout.transform(systemEncoding.decoder).join();
        final stderr = process.stderr.transform(systemEncoding.decoder).join();
        process.stdin.add(stdin);
        await process.stdin.close();
        return CommandResult(
          exitCode: await process.exitCode,
          stdout: await stdout,
          stderr: await stderr,
        );
      }
      final result = await Process.run(
        executable,
        arguments,
        workingDirectory: workingDirectory,
        runInShell: false,
      );
      return CommandResult(
        exitCode: result.exitCode,
        stdout: result.stdout as String,
        stderr: result.stderr as String,
      );
    } on ProcessException catch (error) {
      throw RepositoryAdapterException(
        'Could not run $executable: ${error.message}',
      );
    }
  }
}
