import { env } from "@blabla/env/web";

export type AuthEndpointCheck = {
	ok: boolean;
	message?: string;
};

export async function checkAuthEndpoint(): Promise<AuthEndpointCheck> {
	try {
		const response = await fetch(`${env.VITE_CONVEX_SITE_URL}/api/auth/ok`, {
			headers: { Accept: "application/json" },
		});
		if (!response.ok) {
			return {
				ok: false,
				message: `Auth endpoint returned ${response.status}`,
			};
		}
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : "Auth endpoint failed",
		};
	}
}

export function getConnectionDiagnostics() {
	return {
		convexUrl: env.VITE_CONVEX_URL,
		convexSiteUrl: env.VITE_CONVEX_SITE_URL,
		origin: typeof window === "undefined" ? "server" : window.location.origin,
	};
}
