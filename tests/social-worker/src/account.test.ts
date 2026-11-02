import { createHash } from "node:crypto";
import { route } from "@social-worker/router";
import type { Env } from "@social-worker/env";
import { createTestDb } from "./harness";

type Json = { data: Record<string, any>; error: { code: string; details: Record<string, any> } };

async function setup(...handles: string[]) {
  const env: Env = { PLATFORM_DB: createTestDb(), ENVIRONMENT: "prod" };
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
  const join = (handle: string, code = handle) =>
    call(handle, "POST", "me", { handle, displayName: handle, isAdult: true, inviteCode: code });
  for (const h of handles) {
    await seed(`inv_${h}`, h);
    expect((await join(h)).status).toBe(201);
  }
  const befriend = async (a: string, b: string) => {
    await call(a, "POST", "friend-requests", { handle: b });
    await call(b, "POST", "friend-requests", { handle: a });
  };
  return { call, seed, join, befriend, db };
}

/** A person with something in every table. */
async function busy() {
  const s = await setup("asha", "ben", "cara");
  await s.befriend("asha", "ben");
  await s.call("asha", "POST", "people/ben/scraps", { body: "asha's scrap" });
  await s.call("ben", "POST", "people/asha/scraps", { body: "ben's scrap" });
  await s.call("asha", "POST", "people/ben/testimonials", { body: "asha's words" });
  await s.call("ben", "POST", "people/asha/testimonials", { body: "ben's words" });
  await s.call("asha", "PUT", "people/ben/fan", {});
  await s.call("ben", "PUT", "people/asha/rating", { trusty: 1, cool: 2, funny: 3 });
  await s.call("asha", "PUT", "blocks/cara", {});
  await s.call("asha", "POST", "invites", {});
  await s.call("ben", "POST", "communities", { slug: "bens", name: "Bens" });
  await s.call("asha", "POST", "communities/bens/join", {});
  const topic = (await s.call("asha", "POST", "communities/bens/topics", { title: "Asha's topic", body: "asha's post" })).json.data.id;
  await s.call("ben", "POST", `topics/${topic}/posts`, { body: "reply in asha's topic" });
  const bensTopic = (await s.call("ben", "POST", "communities/bens/topics", { title: "Ben's topic", body: "ben's post" })).json.data.id;
  await s.call("asha", "POST", `topics/${bensTopic}/posts`, { body: "asha's reply" });
  await s.db.prepare("INSERT INTO identity_users (id, email, email_lower) VALUES (?, ?, ?)").bind("asha", "asha@example.com", "asha@example.com").all();
  await s.db.prepare("INSERT INTO identity_sessions (id, user_id, token_hash, expires_at) VALUES ('s', 'asha', 'h', '2099-01-01')").all();
  await s.db.prepare("INSERT INTO identity_auth_identities (id, user_id, provider, subject) VALUES ('a', 'asha', 'google', 'sub')").all();
  return { ...s, topic, bensTopic };
}

describe("export", () => {
  it("includes what they gave, and nothing of anyone else's private data", async () => {
    const { call } = await busy();
    const { status, json } = await call("asha", "GET", "me/export");
    expect(status).toBe(200);
    const d = json.data;
    expect(d.profile.handle).toBe("asha");
    expect(d.friends.map((f: any) => f.handle)).toEqual(["ben"]);
    expect(d.blocked.map((b: any) => b.handle)).toEqual(["cara"]);
    expect(d.scrapsWritten[0].body).toBe("asha's scrap");
    expect(d.scrapsReceived[0].from_handle).toBe("ben");
    expect(d.testimonialsReceived[0].body).toBe("ben's words");
    expect(d.posts.map((p: any) => p.body)).toEqual(expect.arrayContaining(["asha's post", "asha's reply"]));
    expect(d.invitesCreated).toHaveLength(1);
    const text = JSON.stringify(d);
    expect(text).not.toContain("code_hash");
    expect(text).not.toContain("user_id");
    // Ratings others gave them stay private, even from them.
    expect(text).not.toContain('"trusty":1');
  });

  it("is only ever your own", async () => {
    const { call } = await busy();
    expect((await call("cara", "GET", "me/export")).json.data.profile.handle).toBe("cara");
    expect((await call("nobody", "GET", "me/export")).json.error.code).toBe("profile_required");
  });
});

describe("deletion", () => {
  it("needs the handle typed, and refuses GET", async () => {
    const { call } = await busy();
    expect((await call("asha", "POST", "me/delete", { confirmHandle: "wrong" })).status).toBe(422);
    expect((await call("asha", "POST", "me/delete", {})).status).toBe(422);
    expect((await call("asha", "GET", "me")).status).toBe(200);
  });

  it("removes every trace of their words from every table", async () => {
    const { call, db, topic, bensTopic } = await busy();
    expect((await call("asha", "POST", "me/delete", { confirmHandle: "asha" })).status).toBe(200);

    const tables = ["social_profiles", "social_scraps", "social_testimonials", "social_fans", "social_ratings", "social_friendships",
      "social_friend_requests", "social_blocks", "social_community_members", "social_topics", "social_posts", "identity_auth_identities"];
    for (const table of tables) {
      const { results } = await db.prepare(`SELECT * FROM ${table}`).all();
      const text = JSON.stringify(results);
      expect(text.includes('"asha"')).toBe(false);
      expect(text.includes("asha's")).toBe(false);
    }
    expect((await call("ben", "GET", "people/asha")).status).toBe(404);
    expect((await call("ben", "GET", "people/ben/friends")).json.data.people).toEqual([]);
    expect((await call("ben", "GET", `topics/${topic}`)).status).toBe(404);
    expect((await call("ben", "GET", `topics/${bensTopic}`)).json.data.posts.map((p: any) => p.body)).toEqual(["ben's post"]);
  });

  it("erases their email and ends their sessions", async () => {
    const { call, db } = await busy();
    await call("asha", "POST", "me/delete", { confirmHandle: "asha" });
    const user = (await db.prepare("SELECT * FROM identity_users WHERE id = 'asha'").all()).results[0] as any;
    expect(user.status).toBe("deleted");
    expect(user.email).not.toContain("example.com");
    expect(user.email_lower).not.toContain("example.com");
    const session = (await db.prepare("SELECT revoked_at FROM identity_sessions WHERE id = 's'").all()).results[0] as any;
    expect(session.revoked_at).not.toBeNull();
  });

  it("removes their name from the hidden personal organization, and their security log", async () => {
    const { call, db } = await busy();
    await db.prepare("INSERT INTO membership_organizations (id, name, slug, slug_lower) VALUES ('org', 'asha.private', 'x', 'x')").all();
    await db.prepare("INSERT INTO membership_organizations (id, name, slug, slug_lower) VALUES ('other', 'Someone else', 'y', 'y')").all();
    await db.prepare("INSERT INTO membership_organization_members (id, org_id, subject_id) VALUES ('m', 'org', 'asha')").all();
    await db.prepare("INSERT INTO membership_organization_members (id, org_id, subject_id) VALUES ('n', 'other', 'ben')").all();
    await db.prepare("INSERT INTO identity_security_events (id, event_type, outcome, user_id, ip) VALUES ('e', 'login', 'success', 'asha', '10.0.0.1')").all();
    await call("asha", "POST", "me/delete", { confirmHandle: "asha" });
    const names = (await db.prepare("SELECT id, name FROM membership_organizations ORDER BY id").all()).results;
    expect(names).toEqual([{ id: "org", name: "Deleted account" }, { id: "other", name: "Someone else" }]);
    expect((await db.prepare("SELECT * FROM identity_security_events").all()).results).toHaveLength(0);
  });

  it("erases their address from the notification log, leaving others'", async () => {
    const { call, db } = await busy();
    const insert = (id: string, address: string) =>
      db
        .prepare(
          `INSERT INTO notifications_notifications (id, org_id, category, template_key, template_data, channel, recipient_address)
           VALUES (?, 'org', 'security', 'login', '{"email":"' || ? || '"}', 'email', ?)`,
        )
        .bind(id, address, address)
        .all();
    await insert("mine", "asha@example.com");
    await insert("theirs", "ben@example.com");
    await call("asha", "POST", "me/delete", { confirmHandle: "asha" });
    const text = JSON.stringify((await db.prepare("SELECT recipient_address, template_data FROM notifications_notifications").all()).results);
    expect(text).not.toContain("asha@example.com");
    expect(text).toContain("ben@example.com");
  });

  it("treats a still-cached session of a deleted account as signed out, even to rejoin", async () => {
    const { call, seed, db } = await busy();
    await call("asha", "POST", "me/delete", { confirmHandle: "asha" });
    expect((await call("asha", "GET", "me")).json.error.code).toBe("unauthenticated");
    await seed("fresh", "fresh");
    const res = await call("asha", "POST", "me", { handle: "again", displayName: "Again", isAdult: true, inviteCode: "fresh" });
    expect(res.json.error.code).toBe("unauthenticated");
    expect((await db.prepare("SELECT * FROM social_profiles WHERE handle = 'again'").all()).results).toHaveLength(0);
  });

  it("frees the handle, but joining again takes a new invite", async () => {
    const { call, seed } = await busy();
    await call("asha", "POST", "me/delete", { confirmHandle: "asha" });
    // Signing in with that email again makes a new identity, here "asha2".
    const again = (code: string) => call("asha2", "POST", "me", { handle: "asha", displayName: "Asha", isAdult: true, inviteCode: code });
    expect((await call("asha2", "GET", "me")).json.error.code).toBe("profile_required");
    expect((await again("asha")).status).toBe(422);
    await seed("fresh", "fresh");
    expect((await again("fresh")).status).toBe(201);
  });

  it("keeps a spent invite spent, and cancels their open ones", async () => {
    const { call, db, join } = await setup("asha");
    const code = (await call("asha", "POST", "invites", {})).json.data.code;
    await call("asha", "POST", "me/delete", { confirmHandle: "asha" });
    expect((await join("ben", "asha")).status).toBe(422);
    expect((await join("ben", code)).status).toBe(422);
    const rows = (await db.prepare("SELECT redeemed_by FROM social_invites WHERE id = 'inv_asha'").all()).results[0] as any;
    expect(rows.redeemed_by).toBe("deleted");
  });

  it("makes them hand over a community others are in, and removes an empty one", async () => {
    const { call, db } = await setup("asha", "ben");
    await call("asha", "POST", "communities", { slug: "mine", name: "Mine" });
    await call("asha", "POST", "communities", { slug: "shared", name: "Shared" });
    await call("ben", "POST", "communities/shared/join", {});
    const refused = await call("asha", "POST", "me/delete", { confirmHandle: "asha" });
    expect(refused.json.error.code).toBe("hand_over_communities");
    expect(refused.json.error.details.communities).toEqual([{ slug: "shared", name: "Shared" }]);
    await call("asha", "POST", "communities/shared/members/ben/make-owner", {});
    expect((await call("asha", "POST", "me/delete", { confirmHandle: "asha" })).status).toBe(200);
    expect((await call("ben", "GET", "communities/mine")).status).toBe(404);
    expect((await call("ben", "GET", "communities/shared")).json.data.community.myRole).toBe("owner");
    const left = (await db.prepare("SELECT slug FROM social_communities").all()).results as any[];
    expect(left.map((c) => c.slug)).toEqual(["shared"]);
  });

  it("refuses a moderator, so reports always have someone to act on them", async () => {
    const { call, seed, join } = await setup();
    await seed("founder", "f");
    await join("boss", "f");
    expect((await call("boss", "POST", "me/delete", { confirmHandle: "boss" })).json.error.code).toBe("moderator_cannot_delete");
  });

  it("keeps reports they made, anonymously, and closes reports about them", async () => {
    const { call, db, seed, join } = await setup("asha", "ben", "cara");
    await seed("founder", "f");
    await join("boss", "f");
    await call("asha", "POST", "reports", { subjectType: "person", subjectId: "ben", reason: "spam", details: "From asha" });
    await call("cara", "POST", "reports", { subjectType: "person", subjectId: "asha", reason: "hate" });
    await call("asha", "POST", "me/delete", { confirmHandle: "asha" });
    const { reports } = (await call("boss", "GET", "admin/reports")).json.data;
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ subjectId: "ben", details: null, reporter: null });
    const all = JSON.stringify((await db.prepare("SELECT * FROM social_reports").all()).results);
    expect(all).not.toContain("From asha");
    expect(all).not.toContain('"snapshot":"asha');
  });

  it("works on a real uuid-backed identity id", async () => {
    const { call, db, seed } = await setup();
    const uuid = "11111111-2222-3333-4444-555555555555";
    const actor = `usr_${uuid.replaceAll("-", "")}`;
    await db.prepare("INSERT INTO identity_users (id, email, email_lower) VALUES (?, 'me@example.com', 'me@example.com')").bind(uuid).all();
    await seed("i", "i");
    await call(actor, "POST", "me", { handle: "real", displayName: "Real", isAdult: true, inviteCode: "i" });
    expect((await call(actor, "POST", "me/delete", { confirmHandle: "real" })).status).toBe(200);
    const user = (await db.prepare("SELECT email FROM identity_users").all()).results[0] as any;
    expect(user.email).not.toContain("example.com");
  });
});
