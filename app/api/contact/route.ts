import { NextResponse } from "next/server";
import { checkSpam, HONEYPOT_FIELD, spamMessage, STARTED_AT_FIELD, visitorKey } from "@/lib/spam-guard";

type ContactPayload = {
  name?: string;
  email?: string;
  message?: string;
  [HONEYPOT_FIELD]?: string;
  [STARTED_AT_FIELD]?: number;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sends the Contact form to CONTACT_TO_EMAIL through Resend. The recipient is a
 * server-only setting so it never appears on the site. Until both RESEND_API_KEY and
 * CONTACT_TO_EMAIL are set, the form says it's unavailable instead of pretending the
 * message was delivered.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as ContactPayload | null;
  const name = (body?.name || "").trim();
  const email = (body?.email || "").trim();
  const message = (body?.message || "").trim();
  if (!name || !email || !message) {
    return NextResponse.json({ error: "Please fill in your name, email and message." }, { status: 400 });
  }
  if (!EMAIL.test(email) || name.length > 200 || message.length > 5000) {
    return NextResponse.json({ error: "Check your email address and keep the message under 5,000 characters." }, { status: 400 });
  }

  const guard = checkSpam(
    { honeypot: body?.[HONEYPOT_FIELD], startedAt: body?.[STARTED_AT_FIELD], key: visitorKey(req.headers, "contact") },
    { max: 5, windowMs: 10 * 60 * 1000 },
  );
  if (!guard.ok) {
    // Bots that fill the hidden field get a normal-looking reply and nothing is sent.
    if (guard.reason === "bot") return NextResponse.json({ ok: true }, { status: 200 });
    return NextResponse.json(
      { error: spamMessage(guard) },
      { status: guard.reason === "rate_limited" ? 429 : 400, headers: guard.retryAfterSeconds ? { "Retry-After": String(guard.retryAfterSeconds) } : undefined },
    );
  }

  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL?.trim();
  if (!resendKey || !to) {
    return NextResponse.json(
      { error: "The contact form isn't available right now. Please try again later." },
      { status: 503 },
    );
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: "OfferSafe <onboarding@resend.dev>",
        to: [to],
        reply_to: email,
        subject: "OfferSafe contact form submission",
        text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
  } catch {
    return NextResponse.json({ error: "We couldn't send your message. Please try again in a few minutes." }, { status: 502 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
