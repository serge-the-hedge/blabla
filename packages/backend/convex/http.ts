import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();
const internalApi = internal as any;

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json", ...corsHeaders },
	});
}

function readToken(request: Request): string {
	const header = request.headers.get("Authorization") ?? "";
	const match = header.match(/^Bearer\s+(.+)$/i);
	if (!match) throw new Error("Missing bearer token.");
	return match[1]!;
}

async function withAgent<T>(
	ctx: any,
	request: Request,
	scope: "read" | "search" | "propose" | "export",
	rateLimitName:
		| "agentRead"
		| "agentSearch"
		| "agentCreateChangeSet"
		| "agentExport",
	handler: (token: string) => Promise<T>,
) {
	const token = readToken(request);
	const auth = await ctx.runQuery(internalApi.agentApi.authenticateToken, {
		token,
		scope,
	});
	await ctx.runMutation(internalApi.rateLimits.consume, {
		name: rateLimitName,
		key: auth._id,
	});
	await ctx.runMutation(internalApi.agentApi.touchToken, { tokenId: auth._id });
	return await handler(token);
}

function routeError(error: unknown) {
	const message = error instanceof Error ? error.message : "Request failed.";
	const status =
		message.includes("Missing bearer") || message.includes("Invalid")
			? 401
			: 400;
	return json({ error: message }, status);
}

authComponent.registerRoutesLazy(http, createAuth, {
	cors: true,
	trustedOrigins: [process.env.SITE_URL!],
});

http.route({
	pathPrefix: "/api/agent/v1/",
	method: "OPTIONS",
	handler: httpAction(
		async () => new Response(null, { status: 204, headers: corsHeaders }),
	),
});

http.route({
	path: "/api/agent/v1/projects/current",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		try {
			return json(
				await withAgent(
					ctx,
					request,
					"read",
					"agentRead",
					async (token) =>
						await ctx.runQuery(internalApi.agentApi.currentProject, { token }),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/strings/search",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		try {
			const url = new URL(request.url);
			return json(
				await withAgent(
					ctx,
					request,
					"search",
					"agentSearch",
					async (token) =>
						await ctx.runQuery(internalApi.agentApi.searchStrings, {
							token,
							q: url.searchParams.get("q") ?? undefined,
							locale: url.searchParams.get("locale") ?? undefined,
							screen: url.searchParams.get("screen") ?? undefined,
							tag: url.searchParams.get("tag") ?? undefined,
							status: (url.searchParams.get("status") as any) ?? undefined,
							limit: Number(url.searchParams.get("limit") ?? 25),
						}),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/context",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			const body = await request.json();
			return json(
				await withAgent(
					ctx,
					request,
					"read",
					"agentRead",
					async (token) =>
						await ctx.runQuery(internalApi.agentApi.getContext, {
							token,
							keys: body.keys ?? [],
							locales: body.locales ?? [],
							includeHistory: Boolean(body.includeHistory),
						}),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/change-sets",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			const body = await request.json();
			const result = await withAgent(
				ctx,
				request,
				"propose",
				"agentCreateChangeSet",
				async (token) =>
					await ctx.runMutation(internalApi.agentApi.createChangeSetFromKeys, {
						token,
						title: body.title,
						description: body.description,
						items: body.items ?? [],
					}),
			);
			return json({
				changeSetId: result.changeSetId,
				status: "open",
				itemsAccepted: Math.max(
					0,
					(body.items ?? []).length - result.conflicts,
				),
				itemsConflicted: result.conflicts,
				reviewUrl: `/projects/current/reviews/${result.changeSetId}`,
			});
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	pathPrefix: "/api/agent/v1/change-sets/",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		try {
			const id = new URL(request.url).pathname.replace(
				"/api/agent/v1/change-sets/",
				"",
			);
			return json(
				await withAgent(
					ctx,
					request,
					"read",
					"agentRead",
					async (token) =>
						await ctx.runQuery(internalApi.agentApi.getChangeSet, {
							token,
							changeSetId: id as any,
						}),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

http.route({
	path: "/api/agent/v1/export",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			const body = await request.json();
			return json(
				await withAgent(
					ctx,
					request,
					"export",
					"agentExport",
					async (token) =>
						await ctx.runQuery(internalApi.agentApi.exportContent, {
							token,
							format: body.format,
							locale: body.locale,
							selection: body.selection ?? { type: "all" },
						}),
				),
			);
		} catch (error) {
			return routeError(error);
		}
	}),
});

export default http;
