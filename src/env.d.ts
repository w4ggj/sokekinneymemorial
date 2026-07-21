// Augment Cloudflare Env with secrets (set via `wrangler secret put`, not in wrangler.toml)
declare namespace Cloudflare {
  interface Env {
    RESEND_API_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    GOOGLE_CALENDAR_API_KEY?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
  }
}
