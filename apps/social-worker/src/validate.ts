import type { ProfileEdit, SocialProfile } from "@saas/db/social";

export type Fields = Record<string, string[]>;

const HANDLE_RE = /^[a-z][a-z0-9_]{2,29}$/;
const RESERVED = new Set([
  "admin", "administrator", "api", "help", "home", "invite", "join", "koottam", "login", "logout",
  "me", "moderator", "official", "orkut", "root", "security", "settings", "staff", "support", "system", "welcome",
]);

const LIMITS = { displayName: 60, about: 2000, city: 80, country: 80, interests: 500, relationship: 40 } as const;

/** Trims, turns blank into null, and records a problem when over its limit. */
function text(body: Record<string, unknown>, key: keyof typeof LIMITS, current: string | null, fields: Fields): string | null {
  if (!(key in body)) return current;
  const value = body[key];
  if (value === null) return null;
  if (typeof value !== "string") {
    fields[key] = ["Must be text"];
    return current;
  }
  const trimmed = value.trim();
  if (trimmed.length > LIMITS[key]) fields[key] = [`Must be at most ${LIMITS[key]} characters`];
  return trimmed === "" ? null : trimmed;
}

export function parseCreate(body: unknown): {
  fields: Fields;
  inviteCode: string;
  handle: string;
  displayName: string;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const fields: Fields = {};
  const inviteCode = typeof b.inviteCode === "string" ? b.inviteCode.trim() : "";
  const handle = typeof b.handle === "string" ? b.handle.trim().toLowerCase() : "";
  const displayName = typeof b.displayName === "string" ? b.displayName.trim() : "";
  if (!inviteCode) fields.inviteCode = ["An invite is required"];
  if (!HANDLE_RE.test(handle)) {
    fields.handle = ["Use 3 to 30 lowercase letters, numbers or underscores, starting with a letter"];
  } else if (RESERVED.has(handle)) {
    fields.handle = ["That handle is reserved"];
  }
  if (!displayName) fields.displayName = ["A display name is required"];
  else if (displayName.length > LIMITS.displayName) fields.displayName = [`Must be at most ${LIMITS.displayName} characters`];
  if (b.isAdult !== true) fields.isAdult = ["Koottam is for adults only"];
  return { fields, inviteCode, handle, displayName };
}

function day(value: unknown, max: number, key: string, fields: Fields): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    fields[key] = [`Must be a whole number from 1 to ${max}`];
    return null;
  }
  return value;
}

/** Merges a partial edit over the stored profile; omitted fields stay as they are. */
export function parseEdit(body: unknown, current: SocialProfile): { fields: Fields; edit: ProfileEdit } {
  const b = (body ?? {}) as Record<string, unknown>;
  const fields: Fields = {};
  const displayName = text(b, "displayName", current.displayName, fields);
  if (!displayName) fields.displayName = fields.displayName ?? ["A display name is required"];
  const birthdayDay = "birthdayDay" in b ? day(b.birthdayDay, 31, "birthdayDay", fields) : current.birthdayDay;
  const birthdayMonth = "birthdayMonth" in b ? day(b.birthdayMonth, 12, "birthdayMonth", fields) : current.birthdayMonth;
  if ((birthdayDay === null) !== (birthdayMonth === null)) {
    fields.birthdayMonth = fields.birthdayMonth ?? ["Give both a day and a month, or neither"];
  }
  let visibility = current.visibility;
  if ("visibility" in b) {
    if (b.visibility === "everyone" || b.visibility === "friends") visibility = b.visibility;
    else fields.visibility = ["Must be everyone or friends"];
  }
  let birthdayVisible = current.birthdayVisible;
  if ("birthdayVisible" in b) {
    if (typeof b.birthdayVisible === "boolean") birthdayVisible = b.birthdayVisible;
    else fields.birthdayVisible = ["Must be true or false"];
  }
  return {
    fields,
    edit: {
      displayName: displayName ?? current.displayName,
      about: text(b, "about", current.about, fields),
      city: text(b, "city", current.city, fields),
      country: text(b, "country", current.country, fields),
      interests: text(b, "interests", current.interests, fields),
      relationship: text(b, "relationship", current.relationship, fields),
      birthdayDay,
      birthdayMonth,
      birthdayVisible,
      visibility,
    },
  };
}
