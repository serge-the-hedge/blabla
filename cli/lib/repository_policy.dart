/// Branch policy shared by the local sync and delivery adapters.
///
/// The server includes this value in setup and delivery artifacts so a local
/// checkout cannot accidentally publish against the wrong Brickit branch.
const defaultIntegrationBranch = 'develop';
