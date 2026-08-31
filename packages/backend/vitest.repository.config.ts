import { defineConfig } from "vitest/config";

/**
 * Repository Adapter proofs use Node, Git, Dart, and a disposable HTTP server.
 * Keeping them in a separate project leaves the Convex suite uniformly on the
 * edge runtime while preserving one explicit real-checkout command.
 */
export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.repository.test.ts"],
		setupFiles: ["./vitest.setup.ts"],
	},
});
