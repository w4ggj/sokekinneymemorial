import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import Stripe from 'stripe';

export const POST: APIRoute = async ({ request }) => {
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.warn('[checkout] STRIPE_SECRET_KEY not set');
    return json({ ok: false, error: 'Payments are not currently available.' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400);
  }

  const {
    amount_cents,
    cover_fees,
    frequency,
    dedication,
    public_recognition,
    employer,
    donor_name,
    donor_email,
  } = body;

  if (
    typeof amount_cents !== 'number' ||
    !Number.isInteger(amount_cents) ||
    amount_cents < 500
  ) {
    return json({ ok: false, error: 'Minimum donation is $5.' }, 422);
  }
  if (frequency !== 'one_time' && frequency !== 'monthly') {
    return json({ ok: false, error: 'Invalid frequency.' }, 422);
  }

  // Fee coverage: gross = (intended + 0.30) / (1 - 0.029)
  let fee_cents = 0;
  if (cover_fees) {
    const gross = (amount_cents / 100 + 0.30) / (1 - 0.029);
    fee_cents = Math.round(gross * 100) - amount_cents;
  }
  const total_cents = amount_cents + fee_cents;

  const meta: Record<string, string> = {
    source: 'memorial_site',
    type: 'donation',
    amount_intended_cents: String(amount_cents),
    fee_covered: cover_fees ? '1' : '0',
    fee_cents: String(fee_cents),
    frequency,
    public_recognition: public_recognition ? '1' : '0',
  };
  if (dedication) meta.dedication = String(dedication).slice(0, 500);
  if (employer)   meta.employer   = String(employer).slice(0, 200);
  if (donor_name) meta.donor_name = String(donor_name).slice(0, 200);

  const stripe = new Stripe(stripeKey);

  const siteUrl = env.SITE_URL ?? 'https://sokekinneymemorial.org';
  const successUrl = `${siteUrl}/thank-you?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${siteUrl}/donate`;
  const customerEmail = donor_email ? String(donor_email) : undefined;

  let session: Stripe.Checkout.Session;
  try {
    if (frequency === 'one_time') {
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Donation to Soke Kinney Memorial Fund' },
            unit_amount: amount_cents,
          },
          quantity: 1,
        },
      ];
      if (fee_cents > 0) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: { name: 'Processing fee (so your full gift reaches the fund)' },
            unit_amount: fee_cents,
          },
          quantity: 1,
        });
      }
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: lineItems,
        metadata: meta,
        success_url: successUrl,
        cancel_url: cancelUrl,
        ...(customerEmail ? { customer_email: customerEmail } : {}),
      });
    } else {
      // Monthly — fee folded into unit amount
      const label = cover_fees
        ? 'Monthly donation to Soke Kinney Memorial Fund (card fee included)'
        : 'Monthly donation to Soke Kinney Memorial Fund';
      session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: label },
              recurring: { interval: 'month' },
              unit_amount: total_cents,
            },
            quantity: 1,
          },
        ],
        metadata: meta,
        subscription_data: { metadata: meta },
        success_url: successUrl,
        cancel_url: cancelUrl,
        ...(customerEmail ? { customer_email: customerEmail } : {}),
      });
    }
  } catch (err) {
    console.error('[checkout] Stripe error:', err);
    return json({ ok: false, error: 'Could not start checkout. Please try again.' }, 502);
  }

  console.log('[checkout] Session created:', session.id, 'mode:', session.mode);
  return json({ ok: true, url: session.url });
};
