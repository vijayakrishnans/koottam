const KEY = "koottam.pendingInvite";

/** Holds an invite code across the sign-in redirect, in this tab only. */
export function savePendingInvite(code: string): void {
  try {
    window.sessionStorage.setItem(KEY, code);
  } catch {
    /* The welcome form lets the person paste the code instead. */
  }
}

export function readPendingInvite(): string {
  try {
    return window.sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearPendingInvite(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* Nothing to clear. */
  }
}
