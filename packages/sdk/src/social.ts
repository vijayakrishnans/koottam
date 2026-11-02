import type {
  CreateInviteResponse,
  CreateProfileRequest,
  InviteCheckResponse,
  ListInvitesResponse,
  MyProfileResponse,
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
}
