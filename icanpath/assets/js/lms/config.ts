/**
 * Runtime configuration and the preview-mode gate.
 *
 * Preview mode exists so the dashboards can be reviewed before a Supabase
 * project exists. It is deliberately hard to turn on by accident:
 *
 *   - it can only be enabled explicitly, with VITE_PREVIEW_MODE=true
 *   - it is ignored when running on a host that is not localhost
 *   - it is forced off whenever real credentials are present, so a stray flag in
 *     a deployed bundle can never make production show fixtures
 */

import type { AppRole } from "./types.ts";

// Vite substitutes import.meta.env at build time. The optional chain keeps this
// module importable outside a bundler (the Node smoke tests import it directly)
// instead of throwing on a missing object.
const env = (import.meta as { env?: Record<string, string | boolean | undefined> }).env ?? {};

const url = String(env.VITE_SUPABASE_URL ?? "").trim();
const anonKey = String(env.VITE_SUPABASE_ANON_KEY ?? "").trim();

/** True only when the page is served from a developer machine. */
export function isLocalhost(): boolean {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

/**
 * Accepted ways to turn preview on. .env.example and the README both tell
 * people to use 1, so 1 has to work; anything else is off. Earlier this only
 * accepted "true", which silently disabled preview for anyone who followed the
 * documentation, and the pages then tried to reach a Supabase project that did
 * not exist.
 */
const PREVIEW_ON = new Set(["1", "true", "yes", "on"]);

function requestedPreview(): boolean {
  return PREVIEW_ON.has(String(env.VITE_PREVIEW_MODE ?? "").trim().toLowerCase());
}

export const config = {
  /** Credentials are present and real requests will be made. */
  get hasCredentials(): boolean {
    return url.length > 0 && anonKey.length > 0;
  },

  get supabaseUrl(): string {
    return url;
  },

  get supabaseAnonKey(): string {
    return anonKey;
  },

  /**
   * Fixture data is served instead of the database. Real credentials always win,
   * so a forgotten flag cannot mask a real backend.
   */
  get preview(): boolean {
    if (config.hasCredentials) return false;
    return requestedPreview() && isLocalhost();
  },

  /** Which persona preview mode starts as, so the three dashboards differ. */
  get previewRole(): AppRole {
    const requested = String(env.VITE_PREVIEW_ROLE ?? "student");
    if (requested === "tutor" || requested === "admin") return requested;
    return "student";
  },
};

if (!config.hasCredentials && !config.preview) {
  console.warn(
    "[lms] No Supabase credentials and preview mode is off. " +
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or set " +
      "VITE_PREVIEW_MODE=true and serve from localhost to use fixture data.",
  );
}