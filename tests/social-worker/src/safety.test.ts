import { createHash } from "node:crypto";
import { route } from "@social-worker/router";
import type { Env } from "@social-worker/env";
import { createTestDb } from "./harness";

type Json = { data: Record<string, any>; error: { code: string } };

async function setup(environment = "prod", ...handles: string[]) {
  const env: Env = { PLATFORM_DB: createTestDb(), ENVIRONMENT: environment };
  const db = env.PLATFORM_DB!;
  const call = async (actor: string, method: string, path: string, body?: unknown) => {
    const res = await route(
      new Request(`https://social.internal/v1/social/${path}`, {
        method,
        headers: { "content-type": "application/json", "x-actor-subject-id": actor, "x-actor-subject-type": "user" },
        body: body === undefined ? null : JSON.stringify(body),
      }),
      env,
    );
    return { status: res.status, json: (await res.json()) as Json };
  };
  const seed = async (id: string, code: string) => {
    const hash = createHash("sha256").update(code).digest("hex");
    await db.prepare("INSERT OR REPLACE INTO social_invites (id, code_hash, created_at) VALUES (?, ?, ?)").bind(id, hash, "2026-01-01T00:00:00.000Z").all();
  };
  const join = async (handle: string, code = handle) =>
    call(handle, "POST", "me", { handle, displayName: handle, isAdult: true, inviteCode: code });
  // "boss" spends the founder invite, which is what makes a moderator.
  await seed("founder", "founder-code");
  expect((await join("boss", "founder-code")).status).toBe(201);
  for (const h of handles) {
    await seed(`inv_${h}`, h);
    expect((await join(h)).status).toBe(201);
  }
  const befriend = async (a: string, b: string) => {
    await call(a, "POST", "friend-requests", { handle: b });
    await call(b, "POST", "friend-requests", { handle: a });
  };
  return { call, seed, join, befriend, env, db };
}

const REPORT = { subjectType: "person", subjectId: "ben", reason: "harassment" };

describe("who moderates", () => {
  it("is whoever spent the founder invite", async () => {
    const { call } = await setup("prod", "ben");
    expect((await call("boss", "GET", "me")).json.data.profile.isStaff).toBe(true);
    expect((await call("ben", "GET", "me")).json.data.profile.isStaff).toBe(false);
  });

  it("hides the queue from everyone else as if it didn't exist", async () => {
    const { call } = await setup("prod", "ben");
    expect((await call("ben", "GET", "admin/reports")).status).toBe(404);
    expect((await call("ben", "POST", "admin/reports/x/resolve", { action: "dismiss" })).status).toBe(404);
  });

  it("counts the stage test invite on stage, never on prod", async () => {
    const onProd = await setup("prod");
    await onProd.seed("stage-tester", "tester");
    await onProd.join("tess", "tester");
    expect((await onProd.call("tess", "GET", "me")).json.data.profile.isStaff).toBe(false);
    const onStage = await setup("stage");
    await onStage.seed("stage-tester", "tester");
    await onStage.join("tess", "tester");
    expect((await onStage.call("tess", "GET", "me")).json.data.profile.isStaff).toBe(true);
  });
});

describe("reporting", () => {
  it("reaches the queue, with a copy of what was reported", async () => {
    const { call, befriend } = await setup("prod", "ben", "cara");
    await befriend("ben", "cara");
    const id = (await call("ben", "POST", "people/cara/scraps", { body: "nasty words" })).json.data.scrap.id;
    expect((await call("cara", "POST", "reports", { subjectType: "scrap", subjectId: id, reason: "harassment", details: "Please look" })).status).toBe(201);
    const [report] = (await call("boss", "GET", "admin/reports")).json.data.reports;
    expect(report).toMatchObject({ snapshot: "nasty words", reason: "harassment", details: "Please look" });
    expect(report.owner.handle).toBe("ben");
    expect(report.reporter.handle).toBe("cara");
  });

  it("keeps the copy if the author deletes it, and erases it on resolve", async () => {
    const { call, befriend, db } = await setup("prod", "ben", "cara");
    await befriend("ben", "cara");
    const id = (await call("ben", "POST", "people/cara/scraps", { body: "nasty" })).json.data.scrap.id;
    await call("cara", "POST", "reports", { subjectType: "scrap", subjectId: id, reason: "hate" });
    await call("ben", "DELETE", `scraps/${id}`);
    const [report] = (await call("boss", "GET", "admin/reports")).json.data.reports;
    expect(report.snapshot).toBe("nasty");
    await call("boss", "POST", `admin/reports/${report.id}/resolve`, { action: "dismiss" });
    const rows = await db.prepare("SELECT snapshot FROM social_reports").all();
    expect((rows.results[0] as any).snapshot).toBe("");
  });

  it("puts child safety first", async () => {
    const { call } = await setup("prod", "ben", "cara");
    await call("cara", "POST", "reports", REPORT);
    await call("cara", "POST", "reports", { subjectType: "person", subjectId: "boss", reason: "child_safety" });
    const reasons = (await call("boss", "GET", "admin/reports")).json.data.reports.map((r: any) => r.reason);
    expect(reasons).toEqual(["child_safety", "harassment"]);
  });

  it("validates, ignores repeats, and refuses reporting yourself or nothing", async () => {
    const { call } = await setup("prod", "ben", "cara");
    expect((await call("cara", "POST", "reports", { ...REPORT, reason: "because" })).status).toBe(422);
    expect((await call("cara", "POST", "reports", { ...REPORT, subjectType: "thing" })).status).toBe(422);
    expect((await call("cara", "POST", "reports", { ...REPORT, subjectId: "nobody" })).status).toBe(404);
    expect((await call("ben", "POST", "reports", REPORT)).status).toBe(422);
    await call("cara", "POST", "reports", REPORT);
    await call("cara", "POST", "reports", REPORT);
    expect((await call("boss", "GET", "admin/reports")).json.data.reports).toHaveLength(1);
  });

  it("limits how many reports someone can send", async () => {
    const { call, db } = await setup("prod", "ben", "cara");
    const recent = new Date().toISOString();
    for (let i = 0; i < 30; i++) {
      await db
        .prepare("INSERT INTO social_reports (id, reporter_id, subject_type, subject_id, reason, created_at) VALUES (?, 'cara', 'person', ?, 'spam', ?)")
        .bind(`r${i}`, `s${i}`, recent)
        .all();
    }
    expect((await call("cara", "POST", "reports", REPORT)).json.error.code).toBe("report_limit");
  });
});

describe("resolving", () => {
  it("removes content at once, for every kind", async () => {
    const { call, befriend } = await setup("prod", "ben", "cara");
    await befriend("ben", "cara");
    const scrap = (await call("ben", "POST", "people/cara/scraps", { body: "bad" })).json.data.scrap.id;
    await call("cara", "POST", "communities", { slug: "club", name: "Club" });
    await call("ben", "POST", "communities/club/join", {});
    const topic = (await call("ben", "POST", "communities/club/topics", { title: "Bad title", body: "Body" })).json.data.id;
    const post = (await call("ben", "POST", `topics/${topic}/posts`, { body: "Bad post" })).json.data.id;
    const testimonial = (await call("ben", "POST", "people/cara/testimonials", { body: "Bad words" })).json.data.testimonial.id;

    const resolveLast = async () => {
      const reports = (await call("boss", "GET", "admin/reports")).json.data.reports;
      expect((await call("boss", "POST", `admin/reports/${reports[reports.length - 1].id}/resolve`, { action: "remove" })).status).toBe(200);
    };
    await call("cara", "POST", "reports", { subjectType: "scrap", subjectId: scrap, reason: "hate" });
    await resolveLast();
    expect((await call("cara", "GET", "people/cara/scraps")).json.data.scraps).toEqual([]);

    await call("cara", "POST", "reports", { subjectType: "testimonial", subjectId: testimonial, reason: "hate" });
    await resolveLast();
    expect((await call("cara", "GET", "people/cara/testimonials")).json.data.testimonials).toEqual([]);

    await call("cara", "POST", "reports", { subjectType: "post", subjectId: post, reason: "hate" });
    await resolveLast();
    expect((await call("cara", "GET", `topics/${topic}`)).json.data.posts).toHaveLength(1);

    await call("cara", "POST", "reports", { subjectType: "topic", subjectId: topic, reason: "hate" });
    await resolveLast();
    expect((await call("cara", "GET", `topics/${topic}`)).status).toBe(404);

    await call("ben", "POST", "reports", { subjectType: "community", subjectId: "club", reason: "spam" });
    await resolveLast();
    expect((await call("ben", "GET", "communities/club")).status).toBe(404);
  });

  it("closes every open report on the same thing together", async () => {
    const { call } = await setup("prod", "ben", "cara", "dev");
    await call("cara", "POST", "reports", REPORT);
    await call("dev", "POST", "reports", REPORT);
    const [first] = (await call("boss", "GET", "admin/reports")).json.data.reports;
    await call("boss", "POST", `admin/reports/${first.id}/resolve`, { action: "dismiss" });
    expect((await call("boss", "GET", "admin/reports")).json.data.reports).toEqual([]);
  });

  it("refuses removing a person, unknown actions, and a closed report", async () => {
    const { call } = await setup("prod", "ben", "cara");
    await call("cara", "POST", "reports", REPORT);
    const [r] = (await call("boss", "GET", "admin/reports")).json.data.reports;
    expect((await call("boss", "POST", `admin/reports/${r.id}/resolve`, { action: "remove" })).status).toBe(422);
    expect((await call("boss", "POST", `admin/reports/${r.id}/resolve`, { action: "explode" })).status).toBe(422);
    await call("boss", "POST", `admin/reports/${r.id}/resolve`, { action: "dismiss" });
    expect((await call("boss", "POST", `admin/reports/${r.id}/resolve`, { action: "dismiss" })).status).toBe(404);
  });
});

describe("suspension", () => {
  async function suspended() {
    const s = await setup("prod", "ben", "cara");
    await s.befriend("ben", "cara");
    await s.call("ben", "POST", "people/cara/scraps", { body: "bad" });
    await s.db.prepare("INSERT INTO identity_users (id, email, email_lower) VALUES (?, ?, ?)").bind("ben", "ben@example.com", "ben@example.com").all();
    await s.db.prepare("INSERT INTO identity_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)").bind("ses", "ben", "h", "2099-01-01").all();
    await s.call("cara", "POST", "reports", REPORT);
    const [r] = (await s.call("boss", "GET", "admin/reports")).json.data.reports;
    expect((await s.call("boss", "POST", `admin/reports/${r.id}/resolve`, { action: "suspend" })).status).toBe(200);
    return s;
  }

  it("stops them using anything, and ends their sessions", async () => {
    const { call, db } = await suspended();
    for (const [method, path] of [["GET", "me"], ["GET", "home"], ["GET", "people/cara"], ["POST", "communities"]] as const) {
      expect((await call("ben", method, path, method === "POST" ? {} : undefined)).json.error.code).toBe("suspended");
    }
    const session = await db.prepare("SELECT revoked_at FROM identity_sessions WHERE id = 'ses'").all();
    expect((session.results[0] as any).revoked_at).not.toBeNull();
    const user = await db.prepare("SELECT status FROM identity_users WHERE id = 'ben'").all();
    expect((user.results[0] as any).status).toBe("suspended");
  });

  it("hides them and what they wrote from everyone", async () => {
    const { call } = await suspended();
    expect((await call("cara", "GET", "people/ben")).status).toBe(404);
    expect((await call("cara", "GET", "people/cara/scraps")).json.data.scraps).toEqual([]);
    expect((await call("cara", "GET", "search?q=ben")).json.data.people).toEqual([]);
    expect((await call("cara", "GET", "people/cara/friends")).json.data.people).toEqual([]);
  });

  it("stops them rejoining with a new invite", async () => {
    const { call, seed } = await suspended();
    await seed("again", "again");
    const res = await call("ben", "POST", "me", { handle: "benagain", displayName: "Ben", isAdult: true, inviteCode: "again" });
    expect(res.json.error.code).toBe("suspended");
  });

  it("can be lifted by a moderator only", async () => {
    const { call } = await suspended();
    expect((await call("cara", "POST", "admin/people/ben/unsuspend", {})).status).toBe(404);
    expect((await call("boss", "POST", "admin/people/ben/unsuspend", {})).status).toBe(200);
    expect((await call("ben", "GET", "me")).status).toBe(200);
    expect((await call("cara", "GET", "people/ben")).status).toBe(200);
  });

  it("doesn't let a moderator suspend themselves", async () => {
    const { call } = await setup("prod", "cara");
    await call("cara", "POST", "reports", { subjectType: "person", subjectId: "boss", reason: "spam" });
    const [r] = (await call("boss", "GET", "admin/reports")).json.data.reports;
    expect((await call("boss", "POST", `admin/reports/${r.id}/resolve`, { action: "suspend" })).status).toBe(422);
  });
});
