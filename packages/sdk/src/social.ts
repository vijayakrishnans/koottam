import type {
  CreateInviteResponse,
  CommunitiesResponse,
  CommunityMembersResponse,
  CommunityResponse,
  CountersResponse,
  CreateCommunityRequest,
  CreateProfileRequest,
  CreateScrapRequest,
  FriendsResponse,
  InviteCheckResponse,
  HomeResponse,
  ListFriendRequestsResponse,
  ListInvitesResponse,
  MemberAction,
  MyProfileResponse,
  PeopleResponse,
  RatingValues,
  Scrap,
  ScrapsResponse,
  StandingResponse,
  Testimonial,
  TestimonialsResponse,
  TopicResponse,
  TopicsResponse,
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

  home(opts: RequestOptions = {}): Promise<HomeResponse> {
    return this.transport.request({ method: "GET", path: "/v1/social/home" }, opts);
  }

  counters(opts: RequestOptions = {}): Promise<CountersResponse> {
    return this.transport.request({ method: "GET", path: "/v1/social/counters" }, opts);
  }

  scraps(handle: string, opts: RequestOptions = {}): Promise<ScrapsResponse> {
    return this.transport.request({ method: "GET", path: `/v1/social/people/${encodeURIComponent(handle)}/scraps` }, opts);
  }

  writeScrap(handle: string, body: CreateScrapRequest, opts: RequestOptions = {}): Promise<{ scrap: Scrap }> {
    return this.transport.request({ method: "POST", path: `/v1/social/people/${encodeURIComponent(handle)}/scraps`, body }, opts);
  }

  deleteScrap(id: string, opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request({ method: "DELETE", path: `/v1/social/scraps/${encodeURIComponent(id)}` }, opts);
  }

  testimonials(handle: string, opts: RequestOptions = {}): Promise<TestimonialsResponse> {
    return this.transport.request({ method: "GET", path: `/v1/social/people/${encodeURIComponent(handle)}/testimonials` }, opts);
  }

  writeTestimonial(handle: string, body: string, opts: RequestOptions = {}): Promise<{ testimonial: Testimonial }> {
    return this.transport.request(
      { method: "POST", path: `/v1/social/people/${encodeURIComponent(handle)}/testimonials`, body: { body } },
      opts,
    );
  }

  answerTestimonial(id: string, answer: "approve" | "hide", opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request({ method: "POST", path: `/v1/social/testimonials/${encodeURIComponent(id)}/${answer}`, body: {} }, opts);
  }

  deleteTestimonial(id: string, opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request({ method: "DELETE", path: `/v1/social/testimonials/${encodeURIComponent(id)}` }, opts);
  }

  standing(handle: string, opts: RequestOptions = {}): Promise<StandingResponse> {
    return this.transport.request({ method: "GET", path: `/v1/social/people/${encodeURIComponent(handle)}/standing` }, opts);
  }

  setFan(handle: string, fan: boolean, opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request(
      { method: fan ? "PUT" : "DELETE", path: `/v1/social/people/${encodeURIComponent(handle)}/fan`, ...(fan ? { body: {} } : {}) },
      opts,
    );
  }

  rate(handle: string, body: RatingValues, opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request({ method: "PUT", path: `/v1/social/people/${encodeURIComponent(handle)}/rating`, body }, opts);
  }

  communities(q = "", opts: RequestOptions = {}): Promise<CommunitiesResponse> {
    return this.transport.request({ method: "GET", path: `/v1/social/communities?q=${encodeURIComponent(q)}` }, opts);
  }

  personCommunities(handle: string, opts: RequestOptions = {}): Promise<CommunitiesResponse> {
    return this.transport.request({ method: "GET", path: `/v1/social/people/${encodeURIComponent(handle)}/communities` }, opts);
  }

  createCommunity(body: CreateCommunityRequest, opts: RequestOptions = {}): Promise<CommunityResponse> {
    return this.transport.request({ method: "POST", path: "/v1/social/communities", body }, opts);
  }

  community(slug: string, opts: RequestOptions = {}): Promise<CommunityResponse> {
    return this.transport.request({ method: "GET", path: `/v1/social/communities/${encodeURIComponent(slug)}` }, opts);
  }

  deleteCommunity(slug: string, opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request({ method: "DELETE", path: `/v1/social/communities/${encodeURIComponent(slug)}` }, opts);
  }

  joinCommunity(slug: string, opts: RequestOptions = {}): Promise<{ status: string }> {
    return this.transport.request({ method: "POST", path: `/v1/social/communities/${encodeURIComponent(slug)}/join`, body: {} }, opts);
  }

  leaveCommunity(slug: string, opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request({ method: "POST", path: `/v1/social/communities/${encodeURIComponent(slug)}/leave`, body: {} }, opts);
  }

  communityMembers(slug: string, opts: RequestOptions = {}): Promise<CommunityMembersResponse> {
    return this.transport.request({ method: "GET", path: `/v1/social/communities/${encodeURIComponent(slug)}/members` }, opts);
  }

  memberAction(slug: string, handle: string, action: MemberAction, opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request(
      { method: "POST", path: `/v1/social/communities/${encodeURIComponent(slug)}/members/${encodeURIComponent(handle)}/${action}`, body: {} },
      opts,
    );
  }

  topics(slug: string, opts: RequestOptions = {}): Promise<TopicsResponse> {
    return this.transport.request({ method: "GET", path: `/v1/social/communities/${encodeURIComponent(slug)}/topics` }, opts);
  }

  createTopic(slug: string, body: { title: string; body: string }, opts: RequestOptions = {}): Promise<{ id: string }> {
    return this.transport.request({ method: "POST", path: `/v1/social/communities/${encodeURIComponent(slug)}/topics`, body }, opts);
  }

  topic(id: string, opts: RequestOptions = {}): Promise<TopicResponse> {
    return this.transport.request({ method: "GET", path: `/v1/social/topics/${encodeURIComponent(id)}` }, opts);
  }

  reply(id: string, body: string, opts: RequestOptions = {}): Promise<{ id: string }> {
    return this.transport.request({ method: "POST", path: `/v1/social/topics/${encodeURIComponent(id)}/posts`, body: { body } }, opts);
  }

  setTopicLocked(id: string, locked: boolean, opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request({ method: "POST", path: `/v1/social/topics/${encodeURIComponent(id)}/${locked ? "lock" : "unlock"}`, body: {} }, opts);
  }

  deleteTopic(id: string, opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request({ method: "DELETE", path: `/v1/social/topics/${encodeURIComponent(id)}` }, opts);
  }

  deletePost(id: string, opts: RequestOptions = {}): Promise<{ ok: boolean }> {
    return this.transport.request({ method: "DELETE", path: `/v1/social/posts/${encodeURIComponent(id)}` }, opts);
  }
}
