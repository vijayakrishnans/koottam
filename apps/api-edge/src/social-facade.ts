import type { Env } from "./env.js";
import { errorResponse, withEdgeTimings } from "./http.js";
import { replayOrExecute } from "./idempotency.js";
import { resolveActor } from "./resolve-actor.js";
import { createTimings } from "@saas/contracts/timing";

const SOCIAL_RE = /^\/v1\/social\/.+$/;
const PUBLIC_INVITE_RE = /^\/v1\/social\/invites\/[^/]+$/;
const FORWARDED_HEADERS = ["content-type", "traceparent", "idempotency-key"];

/** Checking an invite link answers a stranger; revoking one (DELETE) does not. */
export function isPublicSocialRoute(pathname: string, method: string): boolean {
  return method === "GET" && PUBLIC_INVITE_RE.test(pathname);
}

export function isSocialRoute(pathname: string): boolean {
  return SOCIAL_RE.test(pathname);
}

export async function handlePublicSocialRoute(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  return replayOrExecute(request, requestId, env, "social_public", async () => {
    if (!env.SOCIAL_WORKER) return errorResponse("internal_error", "Social service unavailable", 503, requestId);
    try {
      return await env.SOCIAL_WORKER.fetch(new URL(pathname, "https://social.internal").toString(), {
        method: "GET",
        headers: { "x-request-id": requestId },
      });
    } catch {
      return errorResponse("internal_error", "Social service unavailable", 503, requestId);
    }
  });
}

export async function handleSocialRoute(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  return replayOrExecute(request, requestId, env, "social", async () => {
    if (!env.IDENTITY_WORKER) {
      return errorResponse("internal_error", "Authentication service unavailable", 503, requestId);
    }
    if (!env.SOCIAL_WORKER) return errorResponse("internal_error", "Social service unavailable", 503, requestId);

    const timings = createTimings();
    const endTotal = timings.start("edge_total");
    const session = await timings.measure("edge_auth", () => resolveActor(request, env, requestId));
    if ("error" in session) return session.error;

    // Deliberately no email: a social route never needs to know one.
    const headers = new Headers();
    headers.set("x-request-id", requestId);
    headers.set("x-actor-subject-id", session.subjectId);
    headers.set("x-actor-subject-type", session.subjectType);
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const url = new URL(request.url);
    const target = new URL(pathname + url.search, "https://social.internal");
    const init: RequestInit = { method: request.method, headers };
    if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;

    try {
      const downstream = await timings.measure("edge_downstream", () =>
        env.SOCIAL_WORKER!.fetch(target.toString(), init),
      );
      const response = new Response(downstream.body, { status: downstream.status, headers: downstream.headers });
      endTotal();
      return withEdgeTimings(response, requestId, "edge.social", timings);
    } catch {
      return errorResponse("internal_error", "Social service unavailable", 503, requestId);
    }
  });
}
