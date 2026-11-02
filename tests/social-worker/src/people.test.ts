import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { route } from "@social-worker/router";
import type { Env } from "@social-worker/env";
import { createTestDb } from "./harness";

type Json = {
  data: Record<string, any>;
  error: { code: string; details: { fields: Record<string, string[]> } };
};

const PROFILE = { handle: "asha", displayName: "Asha", isAdult: true };

function setup() {
  const env: Env = { PLATFORM_DB: createTestDb(), ENVIRONMENT: "test" };
  const call = async (method: string, path: string, body?: unknown, actor: string | null = "usr_a") => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (actor) {
      headers["x-actor-subject-id"] = actor;
      headers["x-actor-subject-type"] = "user";
    }
    const res = await route(
      new Request(`https://social.internal/v1/social/${path}`, {
        method,
        headers,
        body: body === undefined ? null : JSON.stringify(body),
      }),
      env,
    );
    return { status: res.status, json: (await res.json()) as Json };
  };
  /** Seeds an unspent invite, as the founder row does, and returns its code. */
  const seedInvite = async (code: string, expiresAt: string | null = null) => {
    const hash = createHash("sha256").update(code).digest("hex");
    await env
      .PLATFORM_DB!.prepare("INSERT INTO social_invites (id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(`inv_${code}`, hash, expiresAt, "2026-01-01T00:00:00.000Z")
      .all();
    return code;
  };
  const join = async (actor: string, handle: string, code: string) =>
    call("POST", "me", { ...PROFILE, handle, inviteCode: code }, actor);
  return { env, call, seedInvite, join };
}

describe("joining", () => {
  it("creates a profile only with a valid invite", async () => {
    const { call, seedInvite } = setup();
    const refused = await call("POST", "me", { ...PROFILE, inviteCode: "nope" });
    expect(refused.status).toBe(422);
    expect(refused.json.error.details.fields.inviteCode).toBeDefined();
    expect((await call("GET", "me")).json.error.code).toBe("profile_required");

    const code = await seedInvite("good-code");
    const created = await call("POST", "me", { ...PROFILE, inviteCode: code });
    expect(created.status).toBe(201);
    expect(created.json.data.profile.handle).toBe("asha");
    expect((await call("GET", "me")).status).toBe(200);
  });

  it("spends an invite once", async () => {
    const { seedInvite, join, call } = setup();
    const code = await seedInvite("one-use");
    expect((await join("usr_a", "asha", code)).status).toBe(201);
    expect((await join("usr_b", "ben", code)).status).toBe(422);
    expect((await call("GET", "me", undefined, "usr_b")).json.error.code).toBe("profile_required");
  });

  it("refuses an expired invite", async () => {
    const { seedInvite, join } = setup();
    const code = await seedInvite("old", "2020-01-01T00:00:00.000Z");
    expect((await join("usr_a", "asha", code)).status).toBe(422);
  });

  it("needs the adult declaration", async () => {
    const { call, seedInvite } = setup();
    const code = await seedInvite("c");
    const res = await call("POST", "me", { handle: "asha", displayName: "Asha", isAdult: false, inviteCode: code });
    expect(res.json.error.details.fields.isAdult).toBeDefined();
  });

  it("refuses bad, reserved and taken handles without spending the invite", async () => {
    const { seedInvite, join } = setup();
    const first = await seedInvite("first");
    const second = await seedInvite("second");
    expect((await join("usr_a", "asha", first)).status).toBe(201);
    for (const handle of ["1bad", "x", "has space", "orkut", "admin", "asha"]) {
      expect((await join("usr_b", handle, second)).status).toBe(422);
    }
    expect((await join("usr_b", "ben", second)).status).toBe(201);
  });

  it("gives a person one profile", async () => {
    const { seedInvite, join } = setup();
    expect((await join("usr_a", "asha", await seedInvite("a"))).status).toBe(201);
    expect((await join("usr_a", "asha2", await seedInvite("b"))).status).toBe(409);
  });

  it("answers the public check without revealing anything else", async () => {
    const { call, seedInvite } = setup();
    const code = await seedInvite("check-me");
    expect((await call("GET", `invites/${code}`, undefined, null)).json.data).toEqual({ valid: true });
    expect((await call("GET", "invites/unknown", undefined, null)).json.data).toEqual({ valid: false });
  });

  it("refuses requests with no person behind them", async () => {
    const { call } = setup();
    expect((await call("GET", "me", undefined, null)).status).toBe(401);
  });
});

describe("the founder invite", () => {
  it("ships in the migration as a hash, with no code in the repository", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "../../packages/db/src/migrations/200_social_people/up.sql"),
      "utf-8",
    );
    expect(sql).toMatch(/VALUES \('founder', '[0-9a-f]{64}'/);
  });
});

describe("profiles", () => {
  async function twoPeople() {
    const s = setup();
    await s.join("usr_a", "asha", await s.seedInvite("a"));
    await s.join("usr_b", "ben", await s.seedInvite("b"));
    return s;
  }

  it("edits only what is sent", async () => {
    const { call } = await twoPeople();
    await call("PATCH", "me", { about: "Hello", city: "Kochi" });
    const { json } = await call("PATCH", "me", { city: "  " });
    expect(json.data.profile.about).toBe("Hello");
    expect(json.data.profile.city).toBeNull();
  });

  it("validates edits", async () => {
    const { call } = await twoPeople();
    expect((await call("PATCH", "me", { about: "x".repeat(2001) })).status).toBe(422);
    expect((await call("PATCH", "me", { displayName: "" })).status).toBe(422);
    expect((await call("PATCH", "me", { birthdayDay: 40, birthdayMonth: 1 })).status).toBe(422);
    expect((await call("PATCH", "me", { birthdayDay: 4 })).status).toBe(422);
    expect((await call("PATCH", "me", { visibility: "nobody" })).status).toBe(422);
  });

  it("shows a page at its handle, without ids or emails", async () => {
    const { call } = await twoPeople();
    await call("PATCH", "me", { about: "Hello" });
    const { status, json } = await call("GET", "people/asha", undefined, "usr_b");
    expect(status).toBe(200);
    expect(json.data.profile.about).toBe("Hello");
    expect(json.data.profile.isMe).toBe(false);
    expect(JSON.stringify(json)).not.toContain("usr_a");
    expect(json.data.profile.visibility).toBeUndefined();
  });

  it("hides a birthday until its owner shows it", async () => {
    const { call } = await twoPeople();
    await call("PATCH", "me", { birthdayDay: 4, birthdayMonth: 2 });
    expect((await call("GET", "people/asha", undefined, "usr_b")).json.data.profile.birthdayDay).toBeNull();
    await call("PATCH", "me", { birthdayVisible: true });
    expect((await call("GET", "people/asha", undefined, "usr_b")).json.data.profile.birthdayDay).toBe(4);
  });

  it("limits a friends-only page to its card", async () => {
    const { call } = await twoPeople();
    await call("PATCH", "me", { about: "Private", visibility: "friends" });
    const { json } = await call("GET", "people/asha", undefined, "usr_b");
    expect(json.data.profile.limited).toBe(true);
    expect(json.data.profile.about).toBeNull();
    expect(json.data.profile.displayName).toBe("Asha");
    expect((await call("GET", "people/asha")).json.data.profile.about).toBe("Private");
  });

  it("does not let someone without a profile read pages", async () => {
    const { call } = await twoPeople();
    expect((await call("GET", "people/asha", undefined, "usr_c")).json.error.code).toBe("profile_required");
  });
});

describe("invites", () => {
  async function member() {
    const s = setup();
    await s.join("usr_a", "asha", await s.seedInvite("a"));
    return s;
  }

  it("mints an invite that works, and shows its code only once", async () => {
    const { call, join } = await member();
    const { status, json } = await call("POST", "invites", {});
    expect(status).toBe(201);
    const { code, invite } = json.data;
    const listed = await call("GET", "invites");
    expect(listed.json.data.invites[0].id).toBe(invite.id);
    expect(JSON.stringify(listed.json)).not.toContain(code);
    expect((await join("usr_b", "ben", code)).status).toBe(201);
    expect((await call("GET", "invites")).json.data.invites[0].status).toBe("redeemed");
  });

  it("caps open invites", async () => {
    const { call } = await member();
    for (let i = 0; i < 10; i++) expect((await call("POST", "invites", {})).status).toBe(201);
    expect((await call("POST", "invites", {})).json.error.code).toBe("invite_limit");
  });

  it("lets only its creator revoke an invite", async () => {
    const { call, join, seedInvite } = await member();
    await join("usr_b", "ben", await seedInvite("b"));
    const { json } = await call("POST", "invites", {});
    const { code, invite } = json.data;
    expect((await call("DELETE", `invites/${invite.id}`, undefined, "usr_b")).status).toBe(404);
    expect((await call("DELETE", `invites/${invite.id}`)).status).toBe(200);
    expect((await join("usr_c", "cara", code)).status).toBe(422);
  });
});
