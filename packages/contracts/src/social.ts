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

export type ScrapVisibility = "everyone" | "friends";

export interface Scrap {
  id: string;
  from: PublicProfileCard;
  to: PublicProfileCard;
  body: string;
  visibility: ScrapVisibility;
  createdAt: string;
  canDelete: boolean;
}

export interface ScrapsResponse {
  scraps: Scrap[];
  /** True when the page is shared with friends only. */
  hidden: boolean;
}

export interface CreateScrapRequest {
  body: string;
  visibility?: ScrapVisibility;
}

export interface UpcomingBirthday extends PublicProfileCard {
  day: number;
  month: number;
}

export interface HomeResponse {
  scraps: Scrap[];
  birthdays: UpcomingBirthday[];
}

export type TestimonialStatus = "pending" | "approved" | "hidden";

export interface Testimonial {
  id: string;
  from: PublicProfileCard;
  body: string;
  /** Only the subject and the author see anything but approved testimonials. */
  status: TestimonialStatus;
  createdAt: string;
  mine: boolean;
}

export interface TestimonialsResponse {
  testimonials: Testimonial[];
  hidden: boolean;
}

export interface RatingValues {
  trusty: number;
  cool: number;
  funny: number;
}

export interface StandingResponse {
  fans: number | null;
  isFan: boolean;
  /** Averages, or null until enough people have rated that nobody's rating can be inferred. */
  ratings: RatingValues | null;
  /** Your own rating of this person. Nobody else's is ever returned. */
  myRating: RatingValues | null;
  canRate: boolean;
}

export interface CountersResponse {
  friendRequests: number;
  testimonials: number;
  scraps: number;
}

export type JoinPolicy = "open" | "approval";
export type CommunityRole = "owner" | "moderator" | "member";
export type MemberStatus = "active" | "pending" | "banned";

export interface CommunitySummary {
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  joinPolicy: JoinPolicy;
  members: number;
}

export interface CommunityDetail extends CommunitySummary {
  owner: PublicProfileCard | null;
  myRole: CommunityRole | null;
  myStatus: MemberStatus | null;
  /** Non-members of an approval community can't read its forum. */
  canRead: boolean;
  canPost: boolean;
  canModerate: boolean;
}

export interface CommunitiesResponse {
  communities: CommunitySummary[];
}

export interface CommunityResponse {
  community: CommunityDetail;
}

export interface CreateCommunityRequest {
  slug: string;
  name: string;
  description?: string | null;
  category?: string | null;
  joinPolicy?: JoinPolicy;
}

export interface CommunityMember extends PublicProfileCard {
  role: CommunityRole;
  status: MemberStatus;
}

export interface CommunityMembersResponse {
  members: CommunityMember[];
}

export type MemberAction = "approve" | "ban" | "unban" | "make-moderator" | "make-member" | "make-owner";

export interface TopicSummary {
  id: string;
  title: string;
  author: PublicProfileCard;
  locked: boolean;
  replies: number;
  lastPostAt: string;
}

export interface TopicsResponse {
  topics: TopicSummary[];
}

export interface Post {
  id: string;
  author: PublicProfileCard;
  body: string;
  createdAt: string;
  canDelete: boolean;
}

export interface TopicResponse {
  topic: TopicSummary & { communitySlug: string; communityName: string; canPost: boolean; canModerate: boolean };
  posts: Post[];
}
