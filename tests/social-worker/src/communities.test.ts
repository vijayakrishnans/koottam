import { createHash } from "node:crypto";
import { route } from "@social-worker/router";
import type { Env } from "@social-worker/env";
import { createTestDb } from "./harness";

type Json = { data: Record<string, any>; error: { code: string; details: { fields: Record<string, string[]> } } };

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
  const community = async (owner: string, slug = "chess", joinPolicy = "open") => {
    const res = await call(owner, "POST", "communities", { slug, name: `The ${slug}`, joinPolicy });
    expect(res.status).toBe(201);
  };
  const topic = async (who: string, slug = "chess", title = "Openings", body = "Which?") => {
    const res = await call(who, "POST", `communities/${slug}/topics`, { title, body });
    expect(res.status).toBe(201);
    return String(res.json.data.id);
  };
  return { call, community, topic, env };
}

const postBodies = (r: { json: Json }) => r.json.data.posts.map((p: any) => p.body);

describe("communities", () => {
  it("creates one with its founder as owner, and lists it", async () => {
    const { call, community } = await setup("asha", "ben");
    await community("asha");
    const { json } = await call("asha", "GET", "communities/chess");
    expect(json.data.community).toMatchObject({ myRole: "owner", canModerate: true, members: 1, owner: { handle: "asha" } });
    expect((await call("ben", "GET", "communities?q=CHE")).json.data.communities.map((c: any) => c.slug)).toEqual(["chess"]);
    expect((await call("ben", "GET", "communities?q=%25")).json.data.communities).toEqual([]);
  });

  it("validates, and refuses a taken or reserved address", async () => {
    const { call, community } = await setup("asha");
    await community("asha");
    expect((await call("asha", "POST", "communities", { slug: "chess", name: "Again" })).json.error.details.fields.slug).toBeDefined();
    expect((await call("asha", "POST", "communities", { slug: "admin", name: "X" })).status).toBe(422);
    expect((await call("asha", "POST", "communities", { slug: "a b", name: "X" })).status).toBe(422);
    expect((await call("asha", "POST", "communities", { slug: "ok-name" })).status).toBe(422);
    expect((await call("asha", "POST", "communities", { slug: "ok-name", name: "X", joinPolicy: "nope" })).status).toBe(422);
  });

  it("limits how many one person can own", async () => {
    const { call, community } = await setup("asha");
    for (let i = 0; i < 20; i++) await community("asha", `com-${i}`);
    expect((await call("asha", "POST", "communities", { slug: "one-more", name: "X" })).json.error.code).toBe("community_limit");
  });

  it("lets a member join and leave an open community", async () => {
    const { call, community } = await setup("asha", "ben");
    await community("asha");
    expect((await call("ben", "POST", "communities/chess/join", {})).json.data.status).toBe("active");
    expect((await call("ben", "GET", "communities/chess")).json.data.community.members).toBe(2);
    expect((await call("ben", "GET", "people/ben/communities")).json.data.communities).toHaveLength(1);
    expect((await call("ben", "POST", "communities/chess/leave", {})).status).toBe(200);
    expect((await call("ben", "GET", "communities/chess")).json.data.community.myRole).toBeNull();
  });

  it("keeps an approval community's forum from outsiders until approved", async () => {
    const { call, community, topic } = await setup("asha", "ben");
    await community("asha", "club", "approval");
    const id = await topic("asha", "club");
    expect((await call("ben", "POST", "communities/club/join", {})).json.data.status).toBe("pending");
    expect((await call("ben", "GET", "communities/club/topics")).json.data.topics).toEqual([]);
    expect((await call("ben", "GET", `topics/${id}`)).status).toBe(404);
    expect((await call("ben", "POST", "communities/club/topics", { title: "t", body: "b" })).status).toBe(403);
    expect((await call("ben", "GET", "communities/club/members")).json.data.members).toEqual([]);
    expect((await call("asha", "POST", "communities/club/members/ben/approve", {})).status).toBe(200);
    expect((await call("ben", "GET", `topics/${id}`)).status).toBe(200);
  });

  it("shows pending people to moderators only", async () => {
    const { call, community } = await setup("asha", "ben", "cara");
    await community("asha", "club", "approval");
    await call("ben", "POST", "communities/club/join", {});
    const all = await call("asha", "GET", "communities/club/members");
    expect(all.json.data.members.map((m: any) => m.handle)).toEqual(["asha", "ben"]);
  });

  it("makes the owner hand over before leaving, and hands over atomically", async () => {
    const { call, community, env } = await setup("asha", "ben");
    await community("asha");
    await call("ben", "POST", "communities/chess/join", {});
    expect((await call("asha", "POST", "communities/chess/leave", {})).json.error.code).toBe("owner_must_hand_over");
    expect((await call("ben", "POST", "communities/chess/members/asha/make-owner", {})).status).toBe(403);
    expect((await call("asha", "POST", "communities/chess/members/ben/make-owner", {})).status).toBe(200);
    expect((await call("ben", "GET", "communities/chess")).json.data.community.myRole).toBe("owner");
    expect((await call("asha", "GET", "communities/chess")).json.data.community.myRole).toBe("moderator");
    const owners = await env.PLATFORM_DB!.prepare("SELECT * FROM social_community_members WHERE role = 'owner'").all();
    expect(owners.results).toHaveLength(1);
    expect((await call("asha", "POST", "communities/chess/leave", {})).status).toBe(200);
  });

  it("lets only the owner delete it, which removes it", async () => {
    const { call, community } = await setup("asha", "ben");
    await community("asha");
    await call("ben", "POST", "communities/chess/join", {});
    expect((await call("ben", "DELETE", "communities/chess")).status).toBe(403);
    expect((await call("asha", "DELETE", "communities/chess")).status).toBe(200);
    expect((await call("ben", "GET", "communities/chess")).status).toBe(404);
    expect((await call("ben", "GET", "communities")).json.data.communities).toEqual([]);
  });
});

describe("forums", () => {
  it("runs a topic with replies, oldest first, and bumps it", async () => {
    const { call, community, topic } = await setup("asha", "ben", "cara");
    await community("asha");
    await call("ben", "POST", "communities/chess/join", {});
    await call("cara", "POST", "communities/chess/join", {});
    const first = await topic("ben", "chess", "First");
    await new Promise((r) => setTimeout(r, 3));
    const second = await topic("ben", "chess", "Second");
    await new Promise((r) => setTimeout(r, 3));
    expect((await call("cara", "POST", `topics/${first}/posts`, { body: "Reply" })).status).toBe(201);
    const { json } = await call("asha", "GET", "communities/chess/topics");
    expect(json.data.topics.map((t: any) => t.id)).toEqual([first, second]);
    expect(json.data.topics[0].replies).toBe(1);
    expect(postBodies(await call("asha", "GET", `topics/${first}`))).toEqual(["Which?", "Reply"]);
  });

  it("refuses non-members, but lets anyone read an open forum", async () => {
    const { call, community, topic } = await setup("asha", "ben");
    await community("asha");
    const id = await topic("asha");
    expect((await call("ben", "GET", `topics/${id}`)).json.data.topic.canPost).toBe(false);
    expect((await call("ben", "POST", `topics/${id}/posts`, { body: "x" })).json.error.code).toBe("members_only");
    expect((await call("ben", "POST", "communities/chess/topics", { title: "t", body: "b" })).status).toBe(403);
  });

  it("validates and limits posts", async () => {
    const { call, community, topic } = await setup("asha");
    await community("asha");
    const id = await topic("asha");
    expect((await call("asha", "POST", `topics/${id}/posts`, { body: " " })).status).toBe(422);
    expect((await call("asha", "POST", `topics/${id}/posts`, { body: "x".repeat(5001) })).status).toBe(422);
    expect((await call("asha", "POST", "communities/chess/topics", { title: "", body: "b" })).status).toBe(422);
    for (let i = 0; i < 59; i++) await call("asha", "POST", `topics/${id}/posts`, { body: `p${i}` });
    expect((await call("asha", "POST", `topics/${id}/posts`, { body: "over" })).json.error.code).toBe("post_limit");
  });
});

describe("moderation", () => {
  async function room() {
    const s = await setup("owner", "mod", "ben", "cara");
    await s.community("owner");
    for (const who of ["mod", "ben", "cara"]) await s.call(who, "POST", "communities/chess/join", {});
    await s.call("owner", "POST", "communities/chess/members/mod/make-moderator", {});
    return s;
  }

  it("lets a moderator remove a post at once, erasing it, and not an ordinary member", async () => {
    const { call, topic, env } = await room();
    const id = await topic("ben");
    const reply = (await call("cara", "POST", `topics/${id}/posts`, { body: "Rude" })).json.data.id;
    expect((await call("ben", "DELETE", `posts/${reply}`)).status).toBe(403);
    expect((await call("mod", "DELETE", `posts/${reply}`)).status).toBe(200);
    expect(postBodies(await call("ben", "GET", `topics/${id}`))).toEqual(["Which?"]);
    const rows = await env.PLATFORM_DB!.prepare("SELECT body FROM social_posts WHERE id = ?").bind(reply).all();
    expect((rows.results[0] as any).body).toBe("");
  });

  it("lets an author delete their own post", async () => {
    const { call, topic } = await room();
    const id = await topic("ben");
    const reply = (await call("cara", "POST", `topics/${id}/posts`, { body: "Mine" })).json.data.id;
    expect((await call("cara", "DELETE", `posts/${reply}`)).status).toBe(200);
  });

  it("bans at once, and leaving or rejoining doesn't undo it", async () => {
    const { call, topic } = await room();
    const id = await topic("owner");
    expect((await call("mod", "POST", "communities/chess/members/cara/ban", {})).status).toBe(200);
    expect((await call("cara", "POST", `topics/${id}/posts`, { body: "x" })).status).toBe(403);
    expect((await call("cara", "POST", "communities/chess/topics", { title: "t", body: "b" })).status).toBe(403);
    expect((await call("cara", "POST", "communities/chess/leave", {})).status).toBe(403);
    expect((await call("cara", "POST", "communities/chess/join", {})).json.error.code).toBe("banned");
    expect((await call("mod", "POST", "communities/chess/members/cara/unban", {})).status).toBe(200);
    expect((await call("cara", "POST", "communities/chess/join", {})).json.data.status).toBe("active");
  });

  it("keeps roles in order", async () => {
    const { call } = await room();
    const act = (who: string, target: string, action: string) => call(who, "POST", `communities/chess/members/${target}/${action}`, {});
    expect((await act("ben", "cara", "ban")).status).toBe(403);
    expect((await act("mod", "owner", "ban")).status).toBe(403);
    expect((await act("mod", "ben", "make-moderator")).status).toBe(403);
    expect((await act("mod", "mod", "ban")).status).toBe(422);
    await act("owner", "ben", "make-moderator");
    expect((await act("mod", "ben", "ban")).status).toBe(403);
    expect((await act("owner", "ben", "ban")).status).toBe(200);
    expect((await call("ben", "GET", "communities/chess")).json.data.community.canModerate).toBe(false);
  });

  it("lets a moderator lock a topic and delete it", async () => {
    const { call, topic } = await room();
    const id = await topic("ben");
    expect((await call("ben", "POST", `topics/${id}/lock`, {})).status).toBe(403);
    expect((await call("mod", "POST", `topics/${id}/lock`, {})).status).toBe(200);
    expect((await call("cara", "POST", `topics/${id}/posts`, { body: "x" })).json.error.code).toBe("locked");
    await call("mod", "POST", `topics/${id}/unlock`, {});
    expect((await call("cara", "POST", `topics/${id}/posts`, { body: "x" })).status).toBe(201);
    expect((await call("mod", "DELETE", `topics/${id}`)).status).toBe(200);
    expect((await call("ben", "GET", `topics/${id}`)).status).toBe(404);
  });

  it("doesn't let moderators of one community act in another", async () => {
    const { call, community, topic } = await room();
    await community("cara", "other");
    await call("ben", "POST", "communities/other/join", {});
    const id = await topic("ben", "other");
    const reply = (await call("cara", "POST", `topics/${id}/posts`, { body: "x" })).json.data.id;
    expect((await call("mod", "DELETE", `posts/${reply}`)).status).toBe(403);
    expect((await call("mod", "POST", `topics/${id}/lock`, {})).status).toBe(403);
    expect((await call("mod", "POST", "communities/other/members/ben/ban", {})).status).toBe(403);
  });
});

describe("blocks inside communities", () => {
  it("hides blocked people's topics, posts and membership from each other", async () => {
    const { call, community, topic } = await setup("asha", "ben", "cara");
    await community("cara");
    await call("asha", "POST", "communities/chess/join", {});
    await call("ben", "POST", "communities/chess/join", {});
    const hers = await topic("asha", "chess", "Asha's");
    const his = await topic("ben", "chess", "Ben's");
    await call("ben", "POST", `topics/${hers}/posts`, { body: "from ben" });
    await call("asha", "POST", `topics/${his}/posts`, { body: "from asha" });
    await call("asha", "PUT", "blocks/ben", {});

    expect((await call("asha", "GET", `topics/${his}`)).status).toBe(404);
    expect((await call("ben", "GET", `topics/${hers}`)).status).toBe(404);
    expect((await call("asha", "POST", `topics/${his}/posts`, { body: "x" })).status).toBe(404);
    expect((await call("ben", "POST", `topics/${hers}/posts`, { body: "x" })).status).toBe(404);
    expect((await call("asha", "GET", "communities/chess/topics")).json.data.topics.map((t: any) => t.title)).toEqual(["Asha's"]);
    expect(postBodies(await call("asha", "GET", `topics/${hers}`))).toEqual(["Which?"]);
    expect((await call("asha", "GET", "communities/chess/topics")).json.data.topics[0].replies).toBe(0);
    expect((await call("cara", "GET", `topics/${hers}`)).json.data.posts).toHaveLength(2);
    const members = (await call("asha", "GET", "communities/chess/members")).json.data.members.map((m: any) => m.handle);
    expect(members).not.toContain("ben");
  });

  it("hides a blocked owner's name and their communities on their page", async () => {
    const { call, community } = await setup("asha", "ben");
    await community("asha");
    await call("ben", "PUT", "blocks/asha", {});
    expect((await call("ben", "GET", "communities/chess")).json.data.community.owner).toBeNull();
    expect((await call("ben", "GET", "people/asha/communities")).status).toBe(404);
  });
});

it("never returns a user id", async () => {
  const { call, community, topic } = await setup("asha");
  await community("asha");
  const id = await topic("asha");
  const payloads = [
    await call("asha", "GET", "communities/chess"),
    await call("asha", "GET", "communities/chess/members"),
    await call("asha", "GET", "communities/chess/topics"),
    await call("asha", "GET", `topics/${id}`),
  ];
  for (const { json } of payloads) {
    expect(JSON.stringify(json)).not.toContain("userId");
    expect(JSON.stringify(json)).not.toContain("ownerId");
    expect(JSON.stringify(json)).not.toContain("asha\",\"user");
  }
});
