/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as bulbs from "../bulbs.js";
import type * as fixtures from "../fixtures.js";
import type * as http from "../http.js";
import type * as inventory from "../inventory.js";
import type * as maintenance from "../maintenance.js";
import type * as migrations from "../migrations.js";
import type * as properties from "../properties.js";
import type * as recaptcha from "../recaptcha.js";
import type * as reminders from "../reminders.js";
import type * as rooms from "../rooms.js";
import type * as search from "../search.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  bulbs: typeof bulbs;
  fixtures: typeof fixtures;
  http: typeof http;
  inventory: typeof inventory;
  maintenance: typeof maintenance;
  migrations: typeof migrations;
  properties: typeof properties;
  recaptcha: typeof recaptcha;
  reminders: typeof reminders;
  rooms: typeof rooms;
  search: typeof search;
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

export declare const components: {};
