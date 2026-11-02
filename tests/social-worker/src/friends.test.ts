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
    const res = await call(handle, "POST", "me", { handle, displayName: handle.toUpperCase(), isAdult: true, inviteCode: handle });
    expect(res.status).toBe(201);
  }
  const befriend = async (a: string, b: string) => {
    expect((await call(a, "POST", "friend-requests", { handle: b })).status).toBe(201);
    const { json } = await call(b, "GET", "friend-requests");
    const id = json.data.incoming.find((r: any) => r.person.handle === a).id;
    expect((await call(b, "POST", `friend-requests/${id}/accept`, {})).status).toBe(200);
  };
  return { call, befriend, env };
}

const handles = (r: { json: Json }) => r.json.data.people.map((p: any) => p.handle);

describe("friend requests", () => {
  it("makes two people friends, seen from both sides", async () => {
    const { call, befriend } = await setup("asha", "ben");
    await befriend("asha", "ben");
    expect(handles(await call("asha", "GET", "people/asha/friends"))).toEqual(["ben"]);
    expect(handles(await call("ben", "GET", "people/ben/friends"))).toEqual(["asha"]);
    expect((await call("asha", "GET", "people/ben")).json.data.profile.connection).toBe("friends");
  });

  it("shows the state of a pending request on each side", async () => {
    const { call } = await setup("asha", "ben");
    await call("asha", "POST", "friend-requests", { handle: "ben" });
    expect((await call("asha", "GET", "people/ben")).json.data.profile.connection).toBe("request_sent");
    expect((await call("ben", "GET", "people/asha")).json.data.profile.connection).toBe("request_received");
    expect((await call("asha", "POST", "friend-requests", { handle: "ben" })).status).toBe(409);
  });

  it("treats asking back as a yes", async () => {
    const { call } = await setup("asha", "ben");
    await call("asha", "POST", "friend-requests", { handle: "ben" });
    expect((await call("ben", "POST", "friend-requests", { handle: "asha" })).json.data.connection).toBe("friends");
    expect(handles(await call("asha", "GET", "people/asha/friends"))).toEqual(["ben"]);
  });

  it("lets only the recipient answer and only the sender cancel", async () => {
    const { call } = await setup("asha", "ben", "cara");
    await call("asha", "POST", "friend-requests", { handle: "ben" });
    const id = (await call("ben", "GET", "friend-requests")).json.data.incoming[0].id;
    for (const actor of ["asha", "cara"]) {
      expect((await call(actor, "POST", `friend-requests/${id}/accept`, {})).status).toBe(404);
      expect((await call(actor, "POST", `friend-requests/${id}/decline`, {})).status).toBe(404);
    }
    expect((await call("ben", "DELETE", `friend-requests/${id}`)).status).toBe(404);
    expect((await call("asha", "DELETE", `friend-requests/${id}`)).status).toBe(200);
    expect((await call("ben", "POST", `friend-requests/${id}/accept`, {})).status).toBe(404);
  });

  it("allows asking again after a decline", async () => {
    const { call } = await setup("asha", "ben");
    await call("asha", "POST", "friend-requests", { handle: "ben" });
    const id = (await call("ben", "GET", "friend-requests")).json.data.incoming[0].id;
    await call("ben", "POST", `friend-requests/${id}/decline`, {});
    expect((await call("asha", "GET", "people/ben")).json.data.profile.connection).toBe("none");
    expect((await call("asha", "POST", "friend-requests", { handle: "ben" })).status).toBe(201);
  });

  it("refuses yourself and people who don't exist", async () => {
    const { call } = await setup("asha");
    expect((await call("asha", "POST", "friend-requests", { handle: "asha" })).status).toBe(422);
    expect((await call("asha", "POST", "friend-requests", { handle: "nobody" })).status).toBe(404);
  });

  it("removes a friendship for both people, and stores one row per pair", async () => {
    const { call, befriend, env } = await setup("asha", "ben");
    await befriend("asha", "ben");
    const rows = await env.PLATFORM_DB!.prepare("SELECT * FROM social_friendships").all();
    expect(rows.results).toHaveLength(1);
    expect((await call("ben", "DELETE", "friends/asha")).status).toBe(200);
    expect(handles(await call("asha", "GET", "people/asha/friends"))).toEqual([]);
    expect((await call("ben", "DELETE", "friends/asha")).status).toBe(404);
  });
});

describe("friends-only pages", () => {
  it("opens to friends and closes again when the friendship ends", async () => {
    const { call, befriend } = await setup("asha", "ben", "cara");
    await call("asha", "PATCH", "me", { about: "Private", visibility: "friends" });
    await befriend("asha", "ben");
    expect((await call("ben", "GET", "people/asha")).json.data.profile.about).toBe("Private");
    expect((await call("cara", "GET", "people/asha")).json.data.profile.about).toBeNull();
    expect((await call("cara", "GET", "people/asha/friends")).json.data).toEqual({ people: [], hidden: true });
    await call("ben", "DELETE", "friends/asha");
    expect((await call("ben", "GET", "people/asha")).json.data.profile.about).toBeNull();
  });
});

describe("mutual friends", () => {
  it("counts the people two members share", async () => {
    const { call, befriend } = await setup("asha", "ben", "cara", "dev");
    await befriend("asha", "cara");
    await befriend("ben", "cara");
    await befriend("asha", "dev");
    expect((await call("asha", "GET", "people/ben")).json.data.profile.mutualFriends).toBe(1);
  });

  it("hides the count on a limited page", async () => {
    const { call } = await setup("asha", "ben");
    await call("asha", "PATCH", "me", { visibility: "friends" });
    expect((await call("ben", "GET", "people/asha")).json.data.profile.mutualFriends).toBeNull();
  });
});

describe("search", () => {
  it("matches handles and names by prefix, and leaves out yourself", async () => {
    const { call } = await setup("asha", "ashok", "ben");
    expect(handles(await call("asha", "GET", "search?q=ash"))).toEqual(["ashok"]);
    expect(handles(await call("ben", "GET", "search?q=ASH"))).toEqual(["asha", "ashok"]);
  });

  it("treats wildcards as plain text and ignores very short queries", async () => {
    const { call } = await setup("asha", "ben");
    expect(handles(await call("ben", "GET", "search?q=%25%25"))).toEqual([]);
    expect(handles(await call("ben", "GET", "search?q=a"))).toEqual([]);
  });
});

describe("blocking", () => {
  it("makes each person disappear for the other, on every route", async () => {
    const { call, befriend } = await setup("asha", "ben", "cara");
    await befriend("asha", "cara");
    await befriend("ben", "cara");
    await call("asha", "POST", "friend-requests", { handle: "ben" });
    expect((await call("asha", "PUT", "blocks/ben", {})).status).toBe(200);

    for (const [viewer, other] of [["asha", "ben"], ["ben", "asha"]] as const) {
      expect((await call(viewer, "GET", `people/${other}`)).status).toBe(404);
      expect((await call(viewer, "GET", `people/${other}/friends`)).status).toBe(404);
      expect((await call(viewer, "POST", "friend-requests", { handle: other })).status).toBe(404);
      expect(handles(await call(viewer, "GET", `search?q=${other}`))).toEqual([]);
      const { incoming, outgoing } = (await call(viewer, "GET", "friend-requests")).json.data;
      expect([...incoming, ...outgoing]).toEqual([]);
      const viaFriend = await call(viewer, "GET", "people/cara/friends");
      expect(handles(viaFriend)).not.toContain(other);
    }
  });

  it("ends a friendship", async () => {
    const { call, befriend } = await setup("asha", "ben");
    await befriend("asha", "ben");
    await call("ben", "PUT", "blocks/asha", {});
    expect(handles(await call("asha", "GET", "people/asha/friends"))).toEqual([]);
    await call("ben", "DELETE", "blocks/asha");
    expect((await call("asha", "GET", "people/ben")).json.data.profile.connection).toBe("none");
  });

  it("cancels a request so it can't be accepted later", async () => {
    const { call } = await setup("asha", "ben");
    await call("asha", "POST", "friend-requests", { handle: "ben" });
    const id = (await call("ben", "GET", "friend-requests")).json.data.incoming[0].id;
    await call("asha", "PUT", "blocks/ben", {});
    await call("asha", "DELETE", "blocks/ben");
    expect((await call("ben", "POST", `friend-requests/${id}/accept`, {})).status).toBe(404);
  });

  it("lists only your own blocks, and refuses blocking yourself", async () => {
    const { call } = await setup("asha", "ben");
    await call("asha", "PUT", "blocks/ben", {});
    expect(handles(await call("asha", "GET", "blocks"))).toEqual(["ben"]);
    expect(handles(await call("ben", "GET", "blocks"))).toEqual([]);
    expect((await call("asha", "PUT", "blocks/asha", {})).status).toBe(422);
  });
});
