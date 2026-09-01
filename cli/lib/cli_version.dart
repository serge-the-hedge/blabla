/// Stamped into every Agent API request. Release builds may override this with
/// `dart compile exe --define=BLABLA_CLI_VERSION=<release version>`.
const blablaCliVersion = String.fromEnvironment(
  'BLABLA_CLI_VERSION',
  defaultValue: '0.1.0',
);

/// The wire-shape generation understood by this binary. The server may require
/// a later generation without treating a newer output algorithm as policy.
const blablaCliProtocol = 1;
