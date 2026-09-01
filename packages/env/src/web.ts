import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

type ImportMetaWithEnv = ImportMeta & {
	readonly env: Record<string, string | undefined>;
};

const parsedEnv = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_CONVEX_URL: z.url(),
		VITE_CONVEX_SITE_URL: z.url().optional(),
		VITE_SITE_URL: z.url().optional(),
	},
	runtimeEnv: (import.meta as ImportMetaWithEnv).env,
	emptyStringAsUndefined: true,
});

function deriveConvexSiteUrl(convexUrl: string) {
	const url = new URL(convexUrl);
	if (!url.hostname.endsWith(".convex.cloud")) {
		throw new Error(
			"VITE_CONVEX_SITE_URL is required when VITE_CONVEX_URL does not use a convex.cloud hostname.",
		);
	}
	url.hostname = `${url.hostname.slice(0, -".convex.cloud".length)}.convex.site`;
	return url.toString().replace(/\/$/, "");
}

export const env = {
	...parsedEnv,
	VITE_CONVEX_SITE_URL:
		parsedEnv.VITE_CONVEX_SITE_URL ??
		deriveConvexSiteUrl(parsedEnv.VITE_CONVEX_URL),
	VITE_SITE_URL: parsedEnv.VITE_SITE_URL,
};
