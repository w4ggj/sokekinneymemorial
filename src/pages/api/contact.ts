import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { Resend } from 'resend';

const TOPIC_LABELS: Record<string, string> = {
  general: 'General',
  donations: 'Donations',
  sponsorship: 'Sponsorship',
  photos: 'Photos of Soke Kinney',
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const json = (): Response => (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const respond = json();

  // Parse body (form sends JSON from the client-side fetch)
  let body: Record<string, string>;
  try {
    body = await request.json() as Record<string, string>;
  } catch {
    return respond({ ok: false, error: 'Invalid request.' }, 400);
  }

  const { name, email, topic, message, website } = body;
  const tsToken = body['cf-turnstile-response'];

  // Honeypot — silent accept so bots don't know they were caught
  if (website) {
    return respond({ ok: true });
  }

  // Field validation
  if (!name?.trim() || !email?.trim() || !topic?.trim() || !message?.trim()) {
    return respond({ ok: false, error: 'All fields are required.' }, 422);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond({ ok: false, error: 'Please enter a valid email address.' }, 422);
  }
  if (!TOPIC_LABELS[topic]) {
    return respond({ ok: false, error: 'Invalid topic.' }, 422);
  }

  // Rate limit: 3 submissions per IP per 60 seconds, stored in KV
  const ip = clientAddress ?? request.headers.get('cf-connecting-ip') ?? 'unknown';
  const rateKey = `rate_contact:${ip}`;
  const existing = await env.CALENDAR_CACHE.get(rateKey);
  const count = existing ? parseInt(existing, 10) : 0;
  if (count >= 3) {
    return respond({ ok: false, error: 'Too many requests. Please try again in a minute.' }, 429);
  }
  await env.CALENDAR_CACHE.put(rateKey, String(count + 1), { expirationTtl: 60 });

  // Turnstile verification — skipped if secret not yet configured
  if (env.TURNSTILE_SECRET_KEY) {
    if (!tsToken) {
      return respond({ ok: false, error: 'Please complete the security check.' }, 422);
    }
    const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: tsToken, remoteip: ip }),
    });
    const tsData = await tsRes.json() as { success: boolean };
    if (!tsData.success) {
      return respond({ ok: false, error: 'Security check failed. Please try again.' }, 422);
    }
  }

  // Send via Resend — skipped if key not yet configured
  if (env.RESEND_API_KEY) {
    console.log('[contact] RESEND_API_KEY present, attempting send');
    const resend = new Resend(env.RESEND_API_KEY);
    const topicLabel = TOPIC_LABELS[topic] ?? topic;
    let sendResult: Awaited<ReturnType<typeof resend.emails.send>>;
    try {
      sendResult = await resend.emails.send({
        // TODO: switch from-address to noreply@sokekinneymemorial.org after domain verification in Resend
        from: 'Soke Kinney Memorial Fund <onboarding@resend.dev>',
        to: 'sokekinneymemorialfund@gmail.com',
        replyTo: email.trim(),
        subject: `[${topicLabel}] Message from ${name.trim()}`,
        text: [
          `Name: ${name.trim()}`,
          `Email: ${email.trim()}`,
          `Topic: ${topicLabel}`,
          '',
          message.trim(),
        ].join('\n'),
      });
    } catch (err) {
      console.error('[contact] Resend threw unexpectedly:', err);
      return respond({ ok: false, error: 'Failed to send message. Please try again or email us directly.' }, 502);
    }
    if (sendResult.error) {
      console.error('[contact] Resend returned error:', JSON.stringify(sendResult.error));
      return respond({ ok: false, error: 'Failed to send message. Please try again or email us directly.' }, 502);
    }
    console.log('[contact] Resend success, id:', sendResult.data?.id);
  } else {
    console.warn('[contact] RESEND_API_KEY not set — email skipped');
  }

  // Write to D1
  await env.DB.prepare(
    'INSERT INTO contact_submissions (id, name, email, topic, message, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      name.trim(),
      email.trim(),
      topic.trim(),
      message.trim(),
      new Date().toISOString(),
    )
    .run();

  return respond({ ok: true });
};
