import { createClient } from "@supabase/supabase-js";
import { sendPasswordChangedEmail, sendWelcomeEmail } from "../../../lib/email";

/**
 * Session-authorised transactional email.
 *
 * The caller proves identity with their Supabase access token, and the target
 * address must equal the signed-in user's own address, so this cannot be used to
 * mail arbitrary recipients. Failures are non-fatal for the client, which fires
 * and forgets.
 */
export async function POST(request: Request): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ ok: false }, { status: 503 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false }, { status: 401 });

  const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.getUser(token);
  const user = data.user;
  if (error || !user?.email) return Response.json({ ok: false }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { type?: string; email?: unknown } | null;
  if (!body || typeof body.email !== "string" || body.email.trim().toLowerCase() !== user.email.toLowerCase()) {
    return Response.json({ ok: false, message: "The target address must match the signed-in account." }, { status: 400 });
  }

  const name = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "there";
  let sent: boolean;
  if (body.type === "welcome") sent = await sendWelcomeEmail(user.email, name);
  else if (body.type === "password_changed") sent = await sendPasswordChangedEmail(user.email, name);
  else return Response.json({ ok: false, message: "Unknown notification type." }, { status: 400 });

  if (!sent) return Response.json({ ok: false, message: "Email is not configured." }, { status: 503 });
  return Response.json({ ok: true }, { status: 202 });
}
