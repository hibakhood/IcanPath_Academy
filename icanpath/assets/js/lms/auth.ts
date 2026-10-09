/**
 * Session handling and route guards.
 *
 * The browser session is only ever used to decide *what to render*. Every read
 * and write is still authorised by Postgres, so a forged or stale session can
 * show the wrong screen but cannot read or change anything.
 */

import { config } from "./config.ts";
import { friendlyError, supabase, unwrap } from "./supabase.ts";
import { previewState, seedPreview } from "./preview-data.ts";
import type { AppRole, Profile } from "./types.ts";

const PREVIEW_KEY = "charterpath.preview.role";

export interface Session {
  profile: Profile;
}

let cached: Session | null = null;
let loaded = false;

function toProfile(row: Record<string, unknown>): Profile {
  return row as unknown as Profile;
}

/* ------------------------------------------------------------- real session */

async function loadProfile(userId: string): Promise<Profile | null> {
  const rows = await unwrap(
    supabase().from("profiles").select("*").eq("id", userId).maybeSingle(),
  );
  return rows ? toProfile(rows as Record<string, unknown>) : null;
}

async function realSession(): Promise<Session | null> {
  const { data } = await supabase().auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  const profile = await loadProfile(user.id);
  if (!profile) return null;
  return { profile };
}

/* ----------------------------------------------------------- preview session */

function previewRole(): AppRole {
  const stored = localStorage.getItem(PREVIEW_KEY);
  if (stored === "tutor" || stored === "admin" || stored === "student") return stored;
  return config.previewRole;
}

function previewSession(): Session | null {
  seedPreview();
  const role = previewRole();
  const profile = previewState.profiles.find((p) => p.role === role);
  if (!profile) return null;
  previewState.role = role;
  previewState.profile = profile;
  return { profile };
}

/** Switches persona while reviewing in preview mode. */
export function setPreviewRole(role: AppRole): void {
  localStorage.setItem(PREVIEW_KEY, role);
  cached = null;
  loaded = false;
}

/* ------------------------------------------------------------------- public */

export async function getSession(): Promise<Session | null> {
  if (loaded) return cached;
  loaded = true;
  try {
    cached = config.preview ? previewSession() : await realSession();
  } catch (error) {
    console.error("[lms] session lookup failed", error);
    cached = null;
  }
  return cached;
}

/** Reads the profile without touching the cache — used after a status change. */
export async function refreshProfile(): Promise<Session | null> {
  loaded = false;
  cached = null;
  return getSession();
}

export async function signIn(email: string, password: string): Promise<Profile> {
  if (config.preview) {
    const role = previewRole();
    setPreviewRole(role);
    seedPreview();
    const profile = previewState.profiles.find((p) => p.role === role);
    if (!profile) throw new Error("A demo is not available for this role.");
    return profile;
  }

  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) {
    if (/invalid login/i.test(error.message)) {
      throw new Error("The email or password is incorrect.");
    }
    throw new Error(friendlyError(error));
  }
  const session = await realSession();
  if (!session) throw new Error("You signed in, but your account details could not be loaded. Contact support.");
  return session.profile;
}

export async function signUp(input: {
  email: string;
  password: string;
  fullName: string;
  requestedRole: "student" | "tutor";
}): Promise<{ needsConfirmation: boolean }> {
  if (config.preview) {
    return { needsConfirmation: false };
  }
  const { data, error } = await supabase().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.fullName,
        // Read by handle_new_user() to decide the role. Only these two values are
        // honoured, so signup can never mint an admin.
        requested_role: input.requestedRole,
      },
    },
  });
  if (error) throw new Error(friendlyError(error));
  cached = null;
  loaded = false;
  return { needsConfirmation: !data.session };
}

export async function signOut(): Promise<{ remoteRevoked: boolean }> {
  if (config.preview) {
    localStorage.removeItem(PREVIEW_KEY);
    cached = null;
    loaded = false;
    return { remoteRevoked: true };
  }
  let failed = false;
  try { const result = await supabase().auth.signOut(); failed = Boolean(result.error); }
  catch { failed = true; }
  cached = null;
  loaded = false;
  // Clear displayed data regardless of provider response.
  document.getElementById("app")?.replaceChildren();
  if (failed) {
    let localCleared = false;
    try { const remaining = await supabase().auth.getSession(); localCleared = !remaining.error && !remaining.data.session; }
    catch { /* Do not claim local cleanup when its state is unknown. */ }
    window.location.replace(localCleared ? "/login/?notice=logout-local" : "/login/?notice=logout-failed");
    throw new Error(localCleared ? "You are signed out on this device. We could not confirm logout on other devices." : "Logout could not be confirmed. Your dashboard has been cleared. Please try again.");
  }
  return { remoteRevoked: true };
}

export async function requestPasswordReset(email: string): Promise<void> {
  if (config.preview) return;
  const { error } = await supabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password/`,
  });
  if (error) throw new Error(friendlyError(error));
}

export async function updatePassword(password: string): Promise<void> {
  if (config.preview) return;
  const { error } = await supabase().auth.updateUser({ password });
  if (error) throw new Error(friendlyError(error));
}

/**
 * Best-effort transactional email (welcome / password changed). Resolved tokens
 * and the same-origin /api/emails route mean only the signed-in user's own
 * address can be notified. Failures never block the flow that triggered them.
 */
export async function notifyEmail(type: "welcome" | "password_changed"): Promise<void> {
  if (config.preview || !config.hasCredentials) return;
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    const email = data.session?.user?.email;
    if (!token || !email) return;
    await fetch(`${window.location.origin}/api/emails`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type, email }),
    });
  } catch (error) {
    console.warn("[lms] email notification skipped", error);
  }
}

/* -------------------------------------------------------------------- guards */

export const dashboardFor = (role: AppRole): string => `/${role}/dashboard/`;

/** Choose an account destination without allowing external or other-role redirects. */
export function destinationFor(profile: Profile, next: string | null = null): string {
  if (profile.status === "suspended") return "/suspended/";
  if (profile.role === "tutor" && profile.status === "pending") return "/pending/";
  if (next && next.startsWith("/") && !/[\\\s]/.test(next)) {
    const target = new URL(next, window.location.origin);
    if (target.origin === window.location.origin && target.pathname.startsWith(`/${profile.role}/`)) {
      return target.pathname + target.search + target.hash;
    }
  }
  return dashboardFor(profile.role);
}

function nextParam(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || !next.startsWith("/")) return "";
  if (next.length === 1) return next;
  const second = next.charAt(1);
  if (second === "/" || second === "\\" || /\s/.test(second)) return "";
  return next;
}

/**
 * Protects a page. Returns the session when the visitor is allowed through, and
 * otherwise redirects and returns null so the caller can stop rendering.
 *
 * A pending tutor or a suspended account lands on their own notice page rather
 * than the dashboard, because the database will refuse their queries anyway and
 * an unexplained empty screen is worse than an explanation.
 */
export async function requireRole(role: AppRole): Promise<Session | null> {
  const session = await getSession();

  if (!session) {
    const next = encodeURIComponent(nextParam() || window.location.pathname);
    window.location.replace(`/login/?next=${next}`);
    return null;
  }

  const { profile } = session;

  if (profile.status === "suspended") {
    window.location.replace("/suspended/");
    return null;
  }

  if (role !== "admin" && profile.role === "admin") {
    window.location.replace(dashboardFor("admin"));
    return null;
  }

  if (profile.role === "tutor" && profile.status === "pending") {
    window.location.replace("/pending/");
    return null;
  }

  if (profile.role !== role) {
    window.location.replace(dashboardFor(profile.role));
    return null;
  }

  if (role === "admin" && !config.preview) {
    const { data, error } = await supabase().auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || data?.currentLevel !== "aal2") {
      window.location.replace("/mfa/");
      return null;
    }
  }
  return session;
}