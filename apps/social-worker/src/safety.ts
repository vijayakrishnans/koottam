import type { ReportItem } from "@saas/contracts/social";
import type { ReportRow, SafetyRepository, SocialProfile, SocialRepository } from "@saas/db/social";
import type { Env } from "./env.js";
import { fail, invalid, notFound, ok } from "./http.js";

const SUBJECTS = new Set(["person", "scrap", "testimonial", "post", "topic", "community"]);
const REASONS = new Set(["harassment", "hate", "sexual", "violence", "spam", "child_safety", "illegal", "other"]);
const RESOLVE_RE = /^\/v1\/social\/admin\/reports\/([^/]+)\/resolve$/;
const UNSUSPEND_RE = /^\/v1\/social\/admin\/people\/([^/]+)\/unsuspend$/;
const MAX_REPORTS_PER_HOUR = 30;

/** The founder invite's spender moderates everywhere. Stage's test invite counts on stage only. */
export async function isStaff(safety: SafetyRepository, userId: string, env: Env): Promise<boolean> {
  const invites = env.ENVIRONMENT === "prod" ? ["founder"] : ["founder", "stage-tester"];
  return (await safety.isListedStaff(userId)) || (await safety.redeemedInvite(userId, invites));
}

function toItem(r: ReportRow): ReportItem {
  const person = (handle: string | null, name: string | null) => (handle && name ? { handle, displayName: name } : null);
  return {
    id: r.id,
    subjectType: r.subjectType as ReportItem["subjectType"],
    subjectId: r.subjectId,
    reason: r.reason as ReportItem["reason"],
    details: r.details,
    snapshot: r.snapshot,
    owner: person(r.ownerHandle, r.ownerName),
    reporter: person(r.reporterHandle, r.reporterName),
    createdAt: r.createdAt,
  };
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function createReport(
  request: Request,
  safety: SafetyRepository,
  me: SocialProfile,
  now: string,
  requestId: string,
): Promise<Response> {
  const body = await readBody(request);
  if (!body) return fail("bad_request", "Body must be JSON", 400, requestId);
  const fields: Record<string, string[]> = {};
  const subjectType = String(body.subjectType ?? "");
  const rawId = typeof body.subjectId === "string" ? body.subjectId.trim() : "";
  const subjectId = subjectType === "person" || subjectType === "community" ? rawId.toLowerCase() : rawId;
  const reason = String(body.reason ?? "");
  if (!SUBJECTS.has(subjectType)) fields.subjectType = ["Unknown kind of report"];
  if (!subjectId) fields.subjectId = ["Say what you're reporting"];
  if (!REASONS.has(reason)) fields.reason = ["Choose a reason"];
  const details = typeof body.details === "string" ? body.details.trim() : "";
  if (details.length > 1000) fields.details = ["Must be at most 1000 characters"];
  if (Object.keys(fields).length > 0) return invalid(requestId, fields);

  const hourAgo = new Date(new Date(now).getTime() - 3_600_000).toISOString();
  if ((await safety.countReportsSince(me.userId, hourAgo)) >= MAX_REPORTS_PER_HOUR) {
    return fail("report_limit", "You've sent a lot of reports. Please try again later", 429, requestId);
  }
  const subject = await safety.subject(subjectType, subjectId);
  if (!subject) return notFound(requestId);
  if (subject.ownerId === me.userId) return invalid(requestId, { subjectId: ["This is yours"] });

  const id = `rpt_${crypto.randomUUID().replaceAll("-", "")}`;
  await safety.createReport({
    id, reporterId: me.userId, subjectType, subjectId, subjectOwner: subject.ownerId,
    snapshot: subject.snapshot, reason, details: details || null, now,
  });
  return ok({ id }, requestId, 201);
}

async function resolve(
  request: Request,
  safety: SafetyRepository,
  me: SocialProfile,
  id: string,
  now: string,
  requestId: string,
): Promise<Response> {
  const body = await readBody(request);
  const action = body?.action;
  if (action !== "dismiss" && action !== "remove" && action !== "suspend") {
    return invalid(requestId, { action: ["Must be dismiss, remove or suspend"] });
  }
  const report = await safety.openReport(id);
  if (!report) return notFound(requestId);
  const { subjectType, subjectId, subjectOwner } = report;

  if (action === "dismiss") {
    await safety.run(safety.resolveStatements(subjectType, subjectId, "dismissed", me.userId, now));
    return ok({ ok: true }, requestId);
  }
  if (action === "remove") {
    if (subjectType === "person") return invalid(requestId, { action: ["A person can only be suspended"] });
    await safety.run([
      ...safety.removalStatements(subjectType, subjectId, now),
      ...safety.resolveStatements(subjectType, subjectId, "removed", me.userId, now),
    ]);
    return ok({ ok: true }, requestId);
  }
  if (!subjectOwner) return invalid(requestId, { action: ["There's no one to suspend"] });
  if (subjectOwner === me.userId) return invalid(requestId, { action: ["You can't suspend yourself"] });
  await safety.run([
    ...safety.removalStatements(subjectType, subjectId, now),
    ...safety.suspensionStatements(subjectOwner, me.userId, now),
    ...safety.resolveStatements(subjectType, subjectId, "suspended", me.userId, now),
  ]);
  return ok({ ok: true }, requestId);
}

/** Reports and the moderation queue. Null means not one of these. */
export async function handleSafetyRoute(
  request: Request,
  env: Env,
  _repo: SocialRepository,
  safety: SafetyRepository,
  me: SocialProfile,
  now: string,
  requestId: string,
): Promise<Response | null> {
  const method = request.method;
  const path = new URL(request.url).pathname;

  if (path === "/v1/social/reports" && method === "POST") return createReport(request, safety, me, now, requestId);
  if (!path.startsWith("/v1/social/admin/")) return null;

  // To anyone else, these routes don't exist.
  if (!(await isStaff(safety, me.userId, env))) return notFound(requestId);

  if (path === "/v1/social/admin/reports" && method === "GET") {
    return ok({ reports: (await safety.openReports()).map(toItem) }, requestId);
  }
  const resolving = RESOLVE_RE.exec(path);
  if (resolving && method === "POST") {
    return resolve(request, safety, me, decodeURIComponent(resolving[1]!), now, requestId);
  }
  const lifting = UNSUSPEND_RE.exec(path);
  if (lifting && method === "POST") {
    const userId = await safety.profileRowByHandle(decodeURIComponent(lifting[1]!).toLowerCase());
    if (!userId || !(await safety.isSuspended(userId))) return notFound(requestId);
    await safety.unsuspend(userId);
    return ok({ ok: true }, requestId);
  }
  return notFound(requestId);
}
