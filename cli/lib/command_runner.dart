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
  });
}

class SystemCommandRunner implements CommandRunner {
  const SystemCommandRunner();

  @override
  Future<CommandResult> run(
    String executable,
    List<String> arguments, {
    required String workingDirectory,
  }) async {
    try {
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
