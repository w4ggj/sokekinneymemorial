import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { Resend } from 'resend';

// Verify a Stripe webhook signature using WebCrypto HMAC-SHA256
async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  const parts = sigHeader.split(',');
  const tPart = parts.find((p) => p.startsWith('t='));
  const v1Part = parts.find((p) => p.startsWith('v1='));
  if (!tPart || !v1Part) return false;

  const timestamp = tPart.slice(2);
  const signature = v1Part.slice(3);

  // Reject if timestamp is more than 5 minutes old
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

// Minimal Stripe REST helpers (avoids SDK complexity in webhook context)
async function stripeGet(path: string, key: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return res.json() as Promise<Record<string, unknown>>;
}

type StripeMetadata = Record<string, string>;

interface StripeSession {
  id: string;
  object: 'checkout.session';
  mode: string;
  metadata: StripeMetadata;
  customer: string | null;
  customer_email: string | null;
  customer_details?: { email?: string; name?: string };
  payment_status: string;
  amount_total: number | null;
  currency: string;
  subscription: string | null;
}

interface StripeInvoice {
  id: string;
  object: 'invoice';
  subscription: string | null;
  metadata: StripeMetadata;
  customer: string | null;
  customer_email: string | null;
  customer_name: string | null;
  amount_paid: number;
  currency: string;
  created: number;
}

interface StripeSub {
  id: string;
  metadata: StripeMetadata;
  customer: string | null;
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export const POST: APIRoute = async ({ request }) => {
  const ok = () =>
    new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  const fail = (msg: string, status = 400) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const stripeKey = env.STRIPE_SECRET_KEY;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) {
    console.warn('[stripe-webhook] Not configured — STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET missing');
    return fail('Not configured', 503);
  }

  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature');
  if (!sig) return fail('Missing stripe-signature header');

  const valid = await verifyStripeSignature(rawBody, sig, webhookSecret);
  if (!valid) {
    console.warn('[stripe-webhook] Signature verification failed');
    return fail('Invalid signature', 400);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return fail('Invalid JSON', 400);
  }

  // Safety filter: only process events tagged as memorial donations
  const topMeta = (event.data.object.metadata ?? {}) as StripeMetadata;
  if (topMeta.type !== 'donation') {
    console.log(
      `[stripe-webhook] Ignoring ${event.type} id=${event.id} — type="${topMeta.type ?? 'absent'}"`,
    );
    return ok();
  }

  console.log(`[stripe-webhook] Handling ${event.type} id=${event.id}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object as unknown as StripeSession, event.id, stripeKey);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as unknown as StripeInvoice, event.id, stripeKey);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as unknown as StripeInvoice, event.id);
        break;
      case 'customer.subscription.deleted':
        console.log(`[stripe-webhook] Subscription deleted: ${(event.data.object as { id: string }).id}`);
        break;
      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] Handler threw for ${event.type}:`, err);
    // Return 500 so Stripe retries
    return fail('Handler error', 500);
  }

  return ok();
};

async function handleCheckoutComplete(
  session: StripeSession,
  eventId: string,
  stripeKey: string,
): Promise<void> {
  // For subscriptions, the real payment is recorded via invoice.paid
  if (session.mode === 'subscription') {
    console.log(`[stripe-webhook] Subscription checkout complete — waiting for invoice.paid`);
    return;
  }

  const meta = session.metadata;
  const amountIntended = parseInt(meta.amount_intended_cents ?? '0', 10);
  const amountCharged  = session.amount_total ?? amountIntended;
  const feeCovered     = meta.fee_covered === '1' ? 1 : 0;
  const donorEmail     = session.customer_details?.email ?? session.customer_email ?? null;
  const donorName      = meta.donor_name ?? session.customer_details?.name ?? null;

  // Idempotent insert — UNIQUE constraint on stripe_event_id silently no-ops on replay
  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO donations
        (id, stripe_event_id, stripe_customer_id, amount_intended, amount_charged,
         fee_covered, currency, frequency, donor_name, donor_email,
         employer, dedication, public_recognition, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      session.id,
      eventId,
      session.customer ?? null,
      amountIntended,
      amountCharged,
      feeCovered,
      session.currency ?? 'usd',
      'one_time',
      donorName,
      donorEmail,
      meta.employer ?? null,
      meta.dedication ?? null,
      meta.public_recognition === '1' ? 1 : 0,
      'succeeded',
      new Date().toISOString(),
    ).run();
    console.log(`[stripe-webhook] Wrote one-time donation to D1: ${session.id}`);
  } catch (err) {
    console.error('[stripe-webhook] D1 write failed:', err);
    throw err;
  }

  await sendDonationReceipt({
    donorEmail,
    donorName,
    amountIntended,
    amountCharged,
    feeCovered: feeCovered === 1,
    frequency: 'one_time',
    dedication: meta.dedication ?? null,
  });
}

async function handleInvoicePaid(
  invoice: StripeInvoice,
  eventId: string,
  stripeKey: string,
): Promise<void> {
  // Fetch subscription metadata to confirm this is a memorial donation
  let meta: StripeMetadata = invoice.metadata ?? {};

  if (invoice.subscription) {
    const sub = await stripeGet(`/subscriptions/${invoice.subscription}`, stripeKey) as unknown as StripeSub;
    meta = { ...sub.metadata, ...meta };
  }

  // Double-check — outer filter already checked invoice metadata but subscription metadata is authoritative
  if (meta.type !== 'donation') {
    console.log(`[stripe-webhook] invoice.paid sub metadata type="${meta.type}" — ignoring`);
    return;
  }

  const amountIntended = parseInt(meta.amount_intended_cents ?? '0', 10);
  const amountCharged  = invoice.amount_paid;
  const feeCovered     = meta.fee_covered === '1' ? 1 : 0;
  const donorEmail     = invoice.customer_email ?? null;
  const donorName      = meta.donor_name ?? invoice.customer_name ?? null;

  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO donations
        (id, stripe_event_id, stripe_customer_id, amount_intended, amount_charged,
         fee_covered, currency, frequency, donor_name, donor_email,
         employer, dedication, public_recognition, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      invoice.id,
      eventId,
      invoice.customer ?? null,
      amountIntended,
      amountCharged,
      feeCovered,
      invoice.currency ?? 'usd',
      'monthly',
      donorName,
      donorEmail,
      meta.employer ?? null,
      meta.dedication ?? null,
      meta.public_recognition === '1' ? 1 : 0,
      'succeeded',
      new Date(invoice.created * 1000).toISOString(),
    ).run();
    console.log(`[stripe-webhook] Wrote recurring donation to D1: ${invoice.id}`);
  } catch (err) {
    console.error('[stripe-webhook] D1 write failed:', err);
    throw err;
  }

  await sendDonationReceipt({
    donorEmail,
    donorName,
    amountIntended,
    amountCharged,
    feeCovered: feeCovered === 1,
    frequency: 'monthly',
    dedication: meta.dedication ?? null,
  });
}

async function handleInvoicePaymentFailed(
  invoice: StripeInvoice,
  eventId: string,
): Promise<void> {
  console.warn(`[stripe-webhook] Payment failed for invoice ${invoice.id} event=${eventId}`);

  if (env.RESEND_API_KEY) {
    const resend = new Resend(env.RESEND_API_KEY);
    try {
      await resend.emails.send({
        from: 'Soke Kinney Memorial Fund <noreply@sokekinneymemorial.org>',
        to: 'sokekinneymemorialfund@gmail.com',
        subject: '[ALERT] Monthly donation payment failed',
        text: [
          'A recurring donation payment failed.',
          '',
          `Invoice ID: ${invoice.id}`,
          `Customer email: ${invoice.customer_email ?? 'unknown'}`,
          `Amount: $${(invoice.amount_paid / 100).toFixed(2)}`,
          '',
          'Log in to Stripe to review.',
        ].join('\n'),
      });
    } catch (err) {
      console.error('[stripe-webhook] Failed to send payment-failed alert:', err);
    }
  }
}

interface ReceiptParams {
  donorEmail: string | null;
  donorName: string | null;
  amountIntended: number;
  amountCharged: number;
  feeCovered: boolean;
  frequency: 'one_time' | 'monthly';
  dedication: string | null;
}

async function sendDonationReceipt(params: ReceiptParams): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn('[stripe-webhook] RESEND_API_KEY not set — receipt skipped');
    return;
  }
  if (!params.donorEmail) {
    console.warn('[stripe-webhook] No donor email — receipt skipped');
    return;
  }

  const amount = `$${(params.amountIntended / 100).toFixed(2)}`;
  const charged = `$${(params.amountCharged / 100).toFixed(2)}`;
  const freqLabel = params.frequency === 'monthly' ? 'Monthly' : 'One-time';

  const lines = [
    'Thank you for your donation to the Soke Kinney Memorial Fund.',
    '',
    `Gift amount: ${amount} (${freqLabel})`,
    ...(params.feeCovered ? [`Total charged: ${charged} (includes processing fee)`] : []),
    `Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    ...(params.dedication ? ['', `In ${params.dedication}`] : []),
    '',
    '---',
    'Soke Kinney Memorial Fund',
    'EIN: 81-2108510 | 501(c)(3) nonprofit',
    '7627 Par Avenue North, St. Petersburg, FL 33710',
    '',
    'No goods or services were provided in exchange for this contribution.',
    'Please retain this email as your donation receipt for tax purposes.',
  ];

  const resend = new Resend(env.RESEND_API_KEY);
  try {
    const result = await resend.emails.send({
      from: 'Soke Kinney Memorial Fund <noreply@sokekinneymemorial.org>',
      to: params.donorEmail,
      replyTo: 'sokekinneymemorialfund@gmail.com',
      subject: `Thank you for your ${freqLabel.toLowerCase()} gift to the Soke Kinney Memorial Fund`,
      text: lines.join('\n'),
    });
    if (result.error) {
      console.error('[stripe-webhook] Resend error sending receipt:', JSON.stringify(result.error));
    } else {
      console.log('[stripe-webhook] Receipt sent, id:', result.data?.id);
    }
  } catch (err) {
    console.error('[stripe-webhook] Resend threw sending receipt:', err);
  }
}
