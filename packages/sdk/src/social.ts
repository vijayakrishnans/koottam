import type {
  CreateInviteResponse,
  CreateProfileRequest,
  FriendsResponse,
  InviteCheckResponse,
  ListFriendRequestsResponse,
  ListInvitesResponse,
  MyProfileResponse,
  PeopleResponse,
  PublicProfileResponse,
  UpdateProfileRequest,
} from "@saas/contracts/social";

import type { RequestOptions, Transport } from "./transport.js";

/** The social network. Maps to `apps/social-worker` through the api-edge social facade. */
export class SocialClient {
  constructor(private readonly transport: Transport) {}

  checkInvite(code: string, opts: RequestOptions = {}): Promise<InviteCheckResponse> {
    return this.transport.request({ method: "GET", path: `/v1/social/invites/${encodeURIComponent(code)}` }, opts);
  }

  listInvites(opts: RequestOptions = {}): Promise<ListInvitesResponse> {
    return this.transport.request({ method: "GET", path: "/v1/social/invites" }, opts);
  }

  createInvite(opts: RequestOptions = {}): Promise<CreateInviteResponse> {
    return this.transport.request({ method: "POST", path: "/v1/social/invites", body: {} }, opts);
  }

  revokeInvite(id: string, opts: RequestOptions = {}): Promise<{ revoked: boolean }> {
    return this.transport.request({ method: "DELETE", path: `/v1/social/invites/${encodeURIComponent(id)}` }, opts);
  }

  me(opts: RequestOptions = {}): Promise<MyProfileResponse> {
    return this.transport.request({ method: "GET", path: "/v1/social/me" }, opts);
  }

  createProfile(body: CreateProfileRequest, opts: RequestOptions = {}): Promise<MyProfileResponse> {
    return this.transport.request({ method: "POST", path: "/v1/social/me", body }, opts);
  }

  updateProfile(body: UpdateProfileRequest, opts: RequestOptions = {}): Promise<MyProfileResponse> {
    return this.transport.request({ method: "PATCH", path: "/v1/social/me", body }, opts);
  }

  person(handle: string, opts: RequestOptions = {}): Promise<PublicProfileResponse> {
    return this.transport.request({ method: "GET", path: `/v1/social/people/${encodeURIComponent(handle)}` }, opts);
  }

  search(q: string, opts: RequestOptions = {}): Promise<PeopleResponse> {
    return this.transport.request({ method: "GET", path: `/v1/social/search?q=${encodeURIComponent(q)}` }, opts);
  }

  friendRequests(opts: RequestOptions = {}): Promise<ListFriendRequestsResponse> {
    return this.transport.request({ method: "GET", path: "/v1/social/friend-requests" }, opts);
  }

  sendFriendRequest(handle: string, opts: RequestOptions = {}): Promise<{ connection: string }> {
    return this.transport.request({ method: "POST", path: "/v1/social/friend-requests", body: { handle } }, opts);
  }

  answerFriendRequest(id: string, answer: "accept" | "decline", opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request(
      { method: "POST", path: `/v1/social/friend-requests/${encodeURIComponent(id)}/${answer}`, body: {} },
      opts,
    );
  }

  cancelFriendRequest(id: string, opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request({ method: "DELETE", path: `/v1/social/friend-requests/${encodeURIComponent(id)}` }, opts);
  }

  friends(handle: string, opts: RequestOptions = {}): Promise<FriendsResponse> {
    return this.transport.request({ method: "GET", path: `/v1/social/people/${encodeURIComponent(handle)}/friends` }, opts);
  }

  unfriend(handle: string, opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request({ method: "DELETE", path: `/v1/social/friends/${encodeURIComponent(handle)}` }, opts);
  }

  blocks(opts: RequestOptions = {}): Promise<PeopleResponse> {
    return this.transport.request({ method: "GET", path: "/v1/social/blocks" }, opts);
  }

  block(handle: string, opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request({ method: "PUT", path: `/v1/social/blocks/${encodeURIComponent(handle)}`, body: {} }, opts);
  }

  unblock(handle: string, opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request({ method: "DELETE", path: `/v1/social/blocks/${encodeURIComponent(handle)}` }, opts);
  }
}
