import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { ConvexError } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;
const authBaseUrl = process.env.BETTER_AUTH_URL ?? siteUrl;

export const authComponent = createClient<DataModel>(components.betterAuth);

function createAuth(ctx: GenericCtx<DataModel>) {
	return betterAuth({
		baseURL: authBaseUrl,
		trustedOrigins: [siteUrl],
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
		},
		plugins: [
			crossDomain({ siteUrl }),
			convex({
				authConfig,
				jwksRotateOnTokenGenerationError: true,
			}),
		],
	});
}

export { createAuth };

export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		return await authComponent.safeGetAuthUser(ctx);
	},
});

export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<{
	id: string;
	email?: string;
	name?: string;
}> {
	const authUser = await authComponent.safeGetAuthUser(ctx);
	if (!authUser) {
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "Sign in required.",
		});
	}
	const user = authUser as {
		_id?: string;
		userId?: string;
		id?: string;
		email?: string;
		name?: string;
		user?: { _id?: string; id?: string; email?: string; name?: string };
	};
	const id =
		user.userId ?? user.id ?? user._id ?? user.user?.id ?? user.user?._id;
	if (!id) {
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "Auth user id missing.",
		});
	}
	return {
		id,
		email: user.email ?? user.user?.email,
		name: user.name ?? user.user?.name,
	};
}
