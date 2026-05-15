/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentApi from "../agentApi.js";
import type * as aggregates from "../aggregates.js";
import type * as apiTokens from "../apiTokens.js";
import type * as auth from "../auth.js";
import type * as changeSets from "../changeSets.js";
import type * as diffs from "../diffs.js";
import type * as exports from "../exports.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as keys from "../keys.js";
import type * as lib from "../lib.js";
import type * as locales from "../locales.js";
import type * as permissions from "../permissions.js";
import type * as privateData from "../privateData.js";
import type * as projects from "../projects.js";
import type * as rateLimits from "../rateLimits.js";
import type * as screens from "../screens.js";
import type * as tags from "../tags.js";
import type * as values from "../values.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentApi: typeof agentApi;
  aggregates: typeof aggregates;
  apiTokens: typeof apiTokens;
  auth: typeof auth;
  changeSets: typeof changeSets;
  diffs: typeof diffs;
  exports: typeof exports;
  healthCheck: typeof healthCheck;
  http: typeof http;
  imports: typeof imports;
  keys: typeof keys;
  lib: typeof lib;
  locales: typeof locales;
  permissions: typeof permissions;
  privateData: typeof privateData;
  projects: typeof projects;
  rateLimits: typeof rateLimits;
  screens: typeof screens;
  tags: typeof tags;
  values: typeof values;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  aggregate: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregate">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
