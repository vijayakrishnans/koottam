export type ProfileVisibility = "everyone" | "friends";

/** What anyone signed in may see. */
export interface PublicProfileCard {
  handle: string;
  displayName: string;
}

export type ConnectionState = "self" | "none" | "request_sent" | "request_received" | "friends";

export interface PublicProfile extends PublicProfileCard {
  /** False when the page is limited to its card by the owner's visibility. */
  limited: boolean;
  about: string | null;
  city: string | null;
  country: string | null;
  interests: string | null;
  relationship: string | null;
  /** Null unless the owner chose to show it. Never includes a year. */
  birthdayDay: number | null;
  birthdayMonth: number | null;
  isMe: boolean;
  joinedAt: string | null;
  connection: ConnectionState;
  /** Set while a request is pending in either direction. */
  friendRequestId: string | null;
  /** Friends you share. Null when the page is limited. */
  mutualFriends: number | null;
}

export interface MyProfile extends PublicProfile {
  birthdayVisible: boolean;
  visibility: ProfileVisibility;
}

export interface CreateProfileRequest {
  inviteCode: string;
  handle: string;
  displayName: string;
  isAdult: boolean;
}

export interface UpdateProfileRequest {
  displayName?: string;
  about?: string | null;
  city?: string | null;
  country?: string | null;
  interests?: string | null;
  relationship?: string | null;
  birthdayDay?: number | null;
  birthdayMonth?: number | null;
  birthdayVisible?: boolean;
  visibility?: ProfileVisibility;
}

export interface MyProfileResponse {
  profile: MyProfile;
}

export interface PublicProfileResponse {
  profile: PublicProfile;
}

export interface InviteCheckResponse {
  valid: boolean;
}

export type InviteStatus = "open" | "redeemed" | "revoked" | "expired";

export interface InviteSummary {
  id: string;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string | null;
}

export interface ListInvitesResponse {
  invites: InviteSummary[];
}

/** `code` appears only here: the server keeps just its hash. */
export interface CreateInviteResponse {
  invite: InviteSummary;
  code: string;
}

export interface FriendRequestSummary {
  id: string;
  person: PublicProfileCard;
  createdAt: string;
}

export interface ListFriendRequestsResponse {
  incoming: FriendRequestSummary[];
  outgoing: FriendRequestSummary[];
}

export interface PeopleResponse {
  people: PublicProfileCard[];
}

export interface FriendsResponse extends PeopleResponse {
  /** True when this person shares their friends with friends only. */
  hidden: boolean;
}
