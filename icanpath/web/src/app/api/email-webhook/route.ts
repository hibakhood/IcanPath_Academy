import { timingSafeEqual } from "node:crypto";
import { sendWelcomeEmail } from "../../../lib/email";

/**
 * Welcome email triggered by a Supabase database webhook on auth.users INSERT.
 *
 * Configure in Supabase: Database -> Webhooks -> Create webhook, subscribe to
 * the `users` table in the `auth` schema, event INSERT, payload "Full record",
 * and call this URL with the header
 *   Authorization: Bearer <EMAIL_WEBHOOK_SECRET>
 */
export async function POST(request: Request): Promise<Response> {
  const expected = process.env.EMAIL_WEBHOOK_SECRET;
  if (!expected) return Response.json({ ok: false }, { status: 503 });

  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(supplied ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const event = (await request.json().catch(() => null)) as { record?: { email?: string; raw_user_meta_data?: Record<string, unknown> } } | null;
  const email = event?.record?.email;
  if (!email) return Response.json({ ok: false }, { status: 400 });

  const name = typeof event?.record?.raw_user_meta_data?.full_name === "string"
    ? event.record.raw_user_meta_data.full_name
    : "there";
  const sent = await sendWelcomeEmail(email, name);
  if (!sent) return Response.json({ ok: false }, { status: 503 });
  return Response.json({ ok: true }, { status: 202 });
}