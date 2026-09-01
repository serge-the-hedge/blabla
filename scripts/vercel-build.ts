const rootDirectory = new URL("..", import.meta.url).pathname;
const backendDirectory = new URL("../packages/backend", import.meta.url)
	.pathname;

async function run(command: string[], cwd: string): Promise<void> {
	const process = Bun.spawn(command, {
		cwd,
		env: Bun.env,
		stdout: "inherit",
		stderr: "inherit",
	});
	const exitCode = await process.exited;
	if (exitCode !== 0) {
		throw new Error(`${command.join(" ")} exited with code ${exitCode}.`);
	}
}

function convexSiteUrl(convexUrl: string): string {
	const url = new URL(convexUrl);
	if (!url.hostname.endsWith(".convex.cloud")) {
		throw new Error("Preview Convex URL must use a convex.cloud hostname.");
	}
	url.hostname = `${url.hostname.slice(0, -".convex.cloud".length)}.convex.site`;
	return url.toString().replace(/\/$/, "");
}

function convexDeploymentName(convexUrl: string): string {
	const hostname = new URL(convexUrl).hostname;
	if (!hostname.endsWith(".convex.cloud")) {
		throw new Error("Preview Convex URL must use a convex.cloud hostname.");
	}
	return hostname.slice(0, -".convex.cloud".length);
}

/** A Convex preview deployment is created before this command runs. Bind its
 * Better Auth instance to the exact Vercel preview origin rather than sharing
 * production's canonical host or another branch's session boundary. */
async function configurePreviewAuth(): Promise<void> {
	if (Bun.env.VERCEL_ENV !== "preview") return;
	const previewHost = Bun.env.VERCEL_URL;
	const convexUrl = Bun.env.VITE_CONVEX_URL;
	if (!(previewHost && convexUrl)) {
		throw new Error(
			"Vercel preview builds require VERCEL_URL and VITE_CONVEX_URL.",
		);
	}
	const previewOrigin = new URL(`https://${previewHost}`).origin;
	const authUrl = convexSiteUrl(convexUrl);
	const deploymentName = convexDeploymentName(convexUrl);
	for (const [name, value] of [
		["SITE_URL", previewOrigin],
		["TRUSTED_ORIGINS", previewOrigin],
		["BETTER_AUTH_URL", authUrl],
	] as const) {
		await run(
			[
				"bunx",
				"convex",
				"env",
				"set",
				"--deployment",
				deploymentName,
				name,
				value,
			],
			backendDirectory,
		);
	}
}

await configurePreviewAuth();
await run(["bun", "run", "build"], rootDirectory);
