/**
 * The single Supabase client, created lazily so that preview mode never needs
 * credentials and a page with no database work never constructs a client.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.ts";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!config.hasCredentials && !client) {
    throw new Error("The app is not connected to its database. Contact support if you need help.");
  }
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        storage: {
          getItem: (key: string) => localStorage.getItem(key) ?? sessionStorage.getItem(key),
          setItem: (key: string, value: string) => {
            const storage = localStorage.getItem("icanpath.remember") === "no" ? sessionStorage : localStorage;
            (storage === localStorage ? sessionStorage : localStorage).removeItem(key);
            storage.setItem(key, value);
          },
          removeItem: (key: string) => { localStorage.removeItem(key); sessionStorage.removeItem(key); },
        },
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/**
 * Test seam. The smoke tests install a recording stand-in here so the real
 * (non-preview) branches of api.ts can be executed in Node, where every request
 * they build is captured and checked against the migrations. Not used by the app.
 */
export function __setSupabaseForTests(next: SupabaseClient | null): void {
  client = next;
}

/** Turns a Postgres error into something worth showing a person. */
export function friendlyError(error: unknown): string {
  if (!error) return "Something went wrong.";
  if (typeof error === "string") return error;
  const candidate = error as { message?: string; code?: string };
  const message = candidate.message ?? "Something went wrong.";

  // Postgres raises these through PostgREST; they are actionable in the UI.
  if (candidate.code === "42501") return "You do not have permission to do that.";
  if (candidate.code === "P0002") return "That item no longer exists.";
  if (candidate.code === "23505") return "That already exists.";
  if (candidate.code === "22023") return "This value is not accepted. Check your entry.";
  if (candidate.code === "P0001") return message;
  console.error("[lms] request failed", error);
  return "We could not complete that request. Please try again.";
}

/**
 * Reads a result from a PostgREST call, turning the error half into a thrown
 * Error so callers can use one try/catch instead of checking `.error` everywhere.
 */
export async function unwrap<T>(promise: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(friendlyError(error));
  return data;
}