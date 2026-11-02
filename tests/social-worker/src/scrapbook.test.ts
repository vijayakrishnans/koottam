import { createHash } from "node:crypto";
import { route } from "@social-worker/router";
import type { Env } from "@social-worker/env";
import { createTestDb } from "./harness";

type Json = { data: Record<string, any>; error: { code: string } };

async function setup(...handles: string[]) {
  const env: Env = { PLATFORM_DB: createTestDb(), ENVIRONMENT: "test" };
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
  for (const handle of handles) {
    const hash = createHash("sha256").update(handle).digest("hex");
    await env
      .PLATFORM_DB!.prepare("INSERT INTO social_invites (id, code_hash, created_at) VALUES (?, ?, ?)")
      .bind(`inv_${handle}`, hash, "2026-01-01T00:00:00.000Z")
      .all();
    expect((await call(handle, "POST", "me", { handle, displayName: handle, isAdult: true, inviteCode: handle })).status).toBe(201);
  }
  const befriend = async (a: string, b: string) => {
    await call(a, "POST", "friend-requests", { handle: b });
    await call(b, "POST", "friend-requests", { handle: a });
  };
  return { call, befriend, env };
}

const bodies = (r: { json: Json }, key = "scraps") => r.json.data[key].map((x: any) => x.body);

describe("scraps", () => {
  it("reaches the recipient's page and their friends' home pages, newest first", async () => {
    const { call, befriend } = await setup("asha", "ben", "cara", "dev");
    await befriend("asha", "ben");
    await befriend("ben", "cara");
    expect((await call("asha", "POST", "people/ben/scraps", { body: "first" })).status).toBe(201);
    await new Promise((r) => setTimeout(r, 5));
    await call("cara", "POST", "people/ben/scraps", { body: "second" });
    expect(bodies(await call("dev", "GET", "people/ben/scraps"))).toEqual(["second", "first"]);
    expect(bodies(await call("ben", "GET", "home"))).toEqual(["second", "first"]);
    expect(bodies(await call("cara", "GET", "home"))).toEqual(["second", "first"]);
    expect(bodies(await call("dev", "GET", "home"))).toEqual([]);
  });

  it("refuses a friends-only scrap to a non-friend", async () => {
    const { call, befriend } = await setup("asha", "ben", "cara");
    await befriend("asha", "ben");
    await call("asha", "POST", "people/ben/scraps", { body: "secret", visibility: "friends" });
    await call("asha", "POST", "people/ben/scraps", { body: "open" });
    expect(bodies(await call("cara", "GET", "people/ben/scraps"))).toEqual(["open"]);
    expect(bodies(await call("asha", "GET", "people/ben/scraps"))).toContain("secret");
    expect(bodies(await call("ben", "GET", "people/ben/scraps"))).toContain("secret");
  });

  it("hides the scrapbook of a friends-only page from non-friends", async () => {
    const { call, befriend } = await setup("asha", "ben", "cara");
    await befriend("asha", "ben");
    await call("asha", "POST", "people/ben/scraps", { body: "hello" });
    await call("ben", "PATCH", "me", { visibility: "friends" });
    expect((await call("cara", "GET", "people/ben/scraps")).json.data).toEqual({ scraps: [], hidden: true });
  });

  it("lets only friends write, and validates", async () => {
    const { call, befriend } = await setup("asha", "ben");
    expect((await call("asha", "POST", "people/ben/scraps", { body: "hi" })).json.error.code).toBe("friends_only");
    await befriend("asha", "ben");
    expect((await call("asha", "POST", "people/ben/scraps", { body: "  " })).status).toBe(422);
    expect((await call("asha", "POST", "people/ben/scraps", { body: "x".repeat(1025) })).status).toBe(422);
    expect((await call("asha", "POST", "people/ben/scraps", { body: "hi", visibility: "nope" })).status).toBe(422);
    expect((await call("asha", "POST", "people/ben/scraps", { body: "<b>hi</b>" })).json.data.scrap.body).toBe("<b>hi</b>");
  });

  it("limits how fast someone can write", async () => {
    const { call, befriend } = await setup("asha", "ben");
    await befriend("asha", "ben");
    for (let i = 0; i < 60; i++) await call("asha", "POST", "people/ben/scraps", { body: `s${i}` });
    expect((await call("asha", "POST", "people/ben/scraps", { body: "too many" })).json.error.code).toBe("scrap_limit");
  });

  it("lets the author or the page owner delete, and no one else, and erases the words", async () => {
    const { call, befriend, env } = await setup("asha", "ben", "cara");
    await befriend("asha", "ben");
    await befriend("ben", "cara");
    const write = async () => (await call("asha", "POST", "people/ben/scraps", { body: "bye" })).json.data.scrap.id;
    const first = await write();
    expect((await call("cara", "DELETE", `scraps/${first}`)).status).toBe(404);
    expect((await call("asha", "DELETE", `scraps/${first}`)).status).toBe(200);
    expect((await call("ben", "DELETE", `scraps/${await write()}`)).status).toBe(200);
    expect(bodies(await call("cara", "GET", "people/ben/scraps"))).toEqual([]);
    const rows = await env.PLATFORM_DB!.prepare("SELECT body FROM social_scraps").all();
    expect(rows.results.every((r: any) => r.body === "")).toBe(true);
  });

  it("keeps blocked people's scraps from each other, including on home", async () => {
    const { call, befriend } = await setup("asha", "ben", "cara");
    await befriend("asha", "cara");
    await befriend("ben", "cara");
    await call("asha", "POST", "people/cara/scraps", { body: "from asha" });
    await call("ben", "POST", "people/cara/scraps", { body: "from ben" });
    await call("asha", "PUT", "blocks/ben", {});
    expect(bodies(await call("asha", "GET", "people/cara/scraps"))).toEqual(["from asha"]);
    expect(bodies(await call("ben", "GET", "people/cara/scraps"))).toEqual(["from ben"]);
    expect(bodies(await call("asha", "GET", "home"))).toEqual(["from asha"]);
    expect((await call("asha", "GET", "people/ben/scraps")).status).toBe(404);
    expect((await call("ben", "POST", "people/asha/scraps", { body: "x" })).status).toBe(404);
  });

  it("never returns a user id", async () => {
    const { call, befriend } = await setup("asha", "ben");
    await befriend("asha", "ben");
    await call("asha", "POST", "people/ben/testimonials", { body: "kind" });
    const { json } = await call("ben", "GET", "people/ben/testimonials");
    expect(JSON.stringify(json)).not.toContain("userId");
    await call("asha", "POST", "people/ben/scraps", { body: "hi" });
    expect(JSON.stringify((await call("ben", "GET", "home")).json)).not.toContain("userId");
  });
});

describe("home birthdays", () => {
  it("shows friends' visible birthdays within a week", async () => {
    const { call, befriend } = await setup("asha", "ben", "cara");
    await befriend("asha", "ben");
    await befriend("asha", "cara");
    const soon = new Date(Date.now() + 2 * 86_400_000);
    await call("ben", "PATCH", "me", { birthdayDay: soon.getUTCDate(), birthdayMonth: soon.getUTCMonth() + 1, birthdayVisible: true });
    await call("cara", "PATCH", "me", { birthdayDay: soon.getUTCDate(), birthdayMonth: soon.getUTCMonth() + 1 });
    const { birthdays } = (await call("asha", "GET", "home")).json.data;
    expect(birthdays.map((b: any) => b.handle)).toEqual(["ben"]);
  });
});

describe("testimonials", () => {
  it("stays invisible until approved, and disappears when hidden", async () => {
    const { call, befriend } = await setup("asha", "ben", "cara");
    await befriend("asha", "ben");
    const { json } = await call("asha", "POST", "people/ben/testimonials", { body: "A good friend" });
    const { id, status } = json.data.testimonial;
    expect(status).toBe("pending");

    expect(bodies(await call("cara", "GET", "people/ben/testimonials"), "testimonials")).toEqual([]);
    expect(bodies(await call("ben", "GET", "people/ben/testimonials"), "testimonials")).toEqual(["A good friend"]);
    expect(bodies(await call("asha", "GET", "people/ben/testimonials"), "testimonials")).toEqual(["A good friend"]);

    await call("ben", "POST", `testimonials/${id}/approve`, {});
    expect(bodies(await call("cara", "GET", "people/ben/testimonials"), "testimonials")).toEqual(["A good friend"]);

    await call("ben", "POST", `testimonials/${id}/hide`, {});
    expect(bodies(await call("cara", "GET", "people/ben/testimonials"), "testimonials")).toEqual([]);
  });

  it("lets only its subject answer and only its author delete", async () => {
    const { call, befriend } = await setup("asha", "ben", "cara");
    await befriend("asha", "ben");
    const { id } = (await call("asha", "POST", "people/ben/testimonials", { body: "Kind" })).json.data.testimonial;
    expect((await call("asha", "POST", `testimonials/${id}/approve`, {})).status).toBe(404);
    expect((await call("cara", "POST", `testimonials/${id}/approve`, {})).status).toBe(404);
    expect((await call("ben", "DELETE", `testimonials/${id}`)).status).toBe(404);
    expect((await call("asha", "DELETE", `testimonials/${id}`)).status).toBe(200);
  });

  it("needs friendship, refuses yourself, and allows one per person", async () => {
    const { call, befriend } = await setup("asha", "ben");
    expect((await call("asha", "POST", "people/ben/testimonials", { body: "x" })).status).toBe(403);
    expect((await call("asha", "POST", "people/asha/testimonials", { body: "x" })).status).toBe(422);
    await befriend("asha", "ben");
    expect((await call("asha", "POST", "people/ben/testimonials", { body: "x" })).status).toBe(201);
    expect((await call("asha", "POST", "people/ben/testimonials", { body: "y" })).status).toBe(409);
  });
});

describe("standing", () => {
  it("counts fans", async () => {
    const { call } = await setup("asha", "ben");
    expect((await call("asha", "PUT", "people/ben/fan", {})).status).toBe(200);
    await call("asha", "PUT", "people/ben/fan", {});
    expect((await call("ben", "GET", "people/ben/standing")).json.data.fans).toBe(1);
    expect((await call("asha", "GET", "people/ben/standing")).json.data.isFan).toBe(true);
    await call("asha", "DELETE", "people/ben/fan");
    expect((await call("ben", "GET", "people/ben/standing")).json.data.fans).toBe(0);
    expect((await call("asha", "PUT", "people/asha/fan", {})).status).toBe(422);
  });

  it("shows averages only once three people have rated, and never who rated what", async () => {
    const { call, befriend } = await setup("asha", "ben", "cara", "dev", "eve");
    for (const f of ["asha", "cara", "dev"]) await befriend(f, "ben");
    const rate = (who: string, trusty: number) => call(who, "PUT", "people/ben/rating", { trusty, cool: 1, funny: 2 });
    await rate("asha", 3);
    await rate("cara", 3);
    expect((await call("eve", "GET", "people/ben/standing")).json.data.ratings).toBeNull();
    await rate("dev", 0);
    const seen = await call("eve", "GET", "people/ben/standing");
    expect(seen.json.data.ratings).toEqual({ trusty: 2, cool: 1, funny: 2 });
    expect(seen.json.data.myRating).toBeNull();
    expect(JSON.stringify(seen.json)).not.toMatch(/asha|cara|dev/);
    expect((await call("asha", "GET", "people/ben/standing")).json.data.myRating.trusty).toBe(3);
  });

  it("lets only friends rate, within range", async () => {
    const { call, befriend } = await setup("asha", "ben");
    const good = { trusty: 1, cool: 1, funny: 1 };
    expect((await call("asha", "PUT", "people/ben/rating", good)).status).toBe(403);
    await befriend("asha", "ben");
    expect((await call("asha", "PUT", "people/ben/rating", { ...good, cool: 4 })).status).toBe(422);
    expect((await call("asha", "PUT", "people/ben/rating", { ...good, cool: 1.5 })).status).toBe(422);
    expect((await call("asha", "PUT", "people/ben/rating", good)).status).toBe(200);
  });

  it("drops fans and ratings between people when one blocks the other", async () => {
    const { call, befriend, env } = await setup("asha", "ben");
    await befriend("asha", "ben");
    await call("asha", "PUT", "people/ben/fan", {});
    await call("asha", "PUT", "people/ben/rating", { trusty: 1, cool: 1, funny: 1 });
    await call("ben", "PUT", "blocks/asha", {});
    expect((await env.PLATFORM_DB!.prepare("SELECT * FROM social_fans").all()).results).toHaveLength(0);
    expect((await env.PLATFORM_DB!.prepare("SELECT * FROM social_ratings").all()).results).toHaveLength(0);
  });
});

describe("counters", () => {
  it("counts what is waiting, and clears scraps when you open your page", async () => {
    const { call, befriend } = await setup("asha", "ben", "cara");
    await befriend("asha", "ben");
    await call("cara", "POST", "friend-requests", { handle: "ben" });
    await call("asha", "POST", "people/ben/scraps", { body: "hi" });
    await call("asha", "POST", "people/ben/testimonials", { body: "kind" });
    expect((await call("ben", "GET", "counters")).json.data).toEqual({ friendRequests: 1, testimonials: 1, scraps: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await call("ben", "GET", "people/ben/scraps");
    expect((await call("ben", "GET", "counters")).json.data.scraps).toBe(0);
  });
});
