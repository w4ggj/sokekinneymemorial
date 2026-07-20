# Soke Kinney Memorial Fund — Website Build Brief

**Replaces:** sokekinneymemorial.org (Google Sites)
**Prepared:** July 2026
**Status:** Design + specification. Not built. Handoff document for Claude Code.

---

## 1. Goal

Rebuild the Soke Kinney Memorial Fund site as a modern, self-hosted Cloudflare-native
site. Carry over all existing content, add a native Stripe donation flow to replace the
current Square link, and give the fund a visual identity that reads as a memorial
organization rather than a page of the karate school.

**Three jobs, in priority order:**

1. Make it easy and trustworthy to donate.
2. Tell the story of Soke Michael Kinney properly.
3. Present the fund as a credible, independent 501(c)(3).

---

## 2. Stack

| Layer | Choice |
|---|---|
| Hosting | Cloudflare Pages |
| API / server logic | Cloudflare Workers |
| Database | D1 (donation ledger, contact submissions) |
| Object storage | R2 (all images) |
| Cache | KV (Google Calendar proxy responses) |
| Payments | Stripe Checkout (hosted), Memorial Fund account only |
| Transactional email | Resend |
| Framework | Astro (matches kinneykarate.com) |

**Account isolation:** this site uses the Soke Kinney Memorial Fund's own Stripe account.
It must not share keys, webhooks, or products with Kinney Karate or Balance Your World.
Store keys as Worker secrets, never in the repo.

---

## 3. Sitemap

```
/               Home
/story          The Story of Soke Michael Kinney
/team           Our Instructors
/events         Events (calendar-driven)
/donate         Donate
/sponsors       Community Partnerships
/contact        Contact
/leadership     STUB — board page, not linked in nav until content exists
/thank-you      Post-donation confirmation
```

The current `/about/*` nesting is flattened. Old URLs must 301:

| Old | New |
|---|---|
| `/home` | `/` |
| `/about/the-story-of-soke-kinney` | `/story` |
| `/about/our-team` | `/team` |
| `/about/sponsors` | `/sponsors` |
| `/about/contact-us` | `/contact` |
| `/events` | `/events` (unchanged) |
| `/donate` | `/donate` (unchanged) |

---

## 4. Design system

### 4.1 Relationship to kinneykarate.com

Sibling, not clone. Shared neutrals and layout grammar make the two sites feel related;
type and pacing make this one feel like a memorial. Tokens below are pulled from the live
kinneykarate.com stylesheet so the neutrals match numerically, not by eye.

**Note:** the navy in the old Kinney Karate logo PNG is legacy artwork. The current KK
site uses no navy. Do not introduce it.

### 4.2 Color tokens

```css
:root {
  /* Shared with kinneykarate.com — do not alter */
  --ink:          #14171B;
  --ink-2:        #1E232A;
  --paper:        #F4F2EC;
  --paper-2:      #EBE8DF;
  --line:         #DAD6CB;
  --text:         #1A1E23;
  --text-soft:    #5C6169;
  --text-invert:  #F4F2EC;

  /* Memorial-specific */
  --crimson:      #A02821;  /* primary accent (KK's --red-dark) */
  --crimson-deep: #7A1E19;  /* hover / pressed */
  --gold:         #E7C331;  /* ceremonial accent — DARK BACKGROUNDS ONLY */

  --r:    10px;
  --r-lg: 14px;
}
```

**Contrast, verified:**

| Pair | Ratio | Use |
|---|---|---|
| `--crimson` on `--paper` | 6.65:1 | Body links, buttons — passes AA at any size |
| `--ink` on `--paper` | 16.06:1 | Body text |
| `--text-soft` on `--paper` | 5.57:1 | Captions, metadata |
| `--gold` on `--ink` | 10.49:1 | Dates, ceremonial marks |
| `--gold` on `--paper` | **1.53:1** | **Never. Fails outright.** |

Do not use KK's brighter `--red` (#C1332B) as the primary. It reads promotional and is
marginal for body text at 4.97:1.

**Balance:** paper-dominant. Ink is reserved for the hero band, the impact strip, and the
footer. Roughly 80/20 paper to ink across the site. KK can run dark and energetic; this
site should feel open and quiet.

### 4.3 Typography

| Role | Face | Notes |
|---|---|---|
| Display | **Newsreader** | Headings, pull quotes, the biography. Editorial serif with a wide optical range — carries long-form reading and commemorative weight. |
| Body / UI | **Barlow** | Shared with kinneykarate.com. Nav, buttons, forms, short copy. |
| Data / caption | **Space Mono** | Also shared with KK. Dates, photo caption plates, figures. |

Space Mono is doing real work here, not decoration — see §4.5.

**Type scale** (fluid, `clamp()`):

```
display   clamp(2.75rem, 6vw, 5rem)      Newsreader 400, -0.02em
h1        clamp(2.25rem, 4.5vw, 3.5rem)  Newsreader 400
h2        clamp(1.75rem, 3vw, 2.5rem)    Newsreader 400
h3        1.35rem                        Newsreader 500
lede      clamp(1.15rem, 1.6vw, 1.35rem) Newsreader 300, 1.6 line-height
body      1.0625rem / 1.7                Barlow 400
caption   0.8125rem / 1.5                Space Mono 400, 0.02em
eyebrow   0.75rem                        Space Mono 400, uppercase, 0.14em
```

Body copy max-width 68ch. The biography is long; it must be comfortable to read.

### 4.4 Layout

Reuse KK's spacing scale and radii so structure feels identical. Differences:

- Section vertical rhythm ~1.5× KK's. Fewer elements per screen.
- Single-column content spine at 68ch, with full-width bands for hero, impact, and footer.
- One primary action sitewide: **Donate**. No cart, no store, no urgency language.

### 4.5 Signature element — "the record"

Every photograph is presented as a catalogued archival record, not as decoration.

```
┌──────────────────────────┐
│                          │
│        [ image ]         │   ← displayed at or below native size, never upscaled
│                          │
├──────────────────────────┤
│ 1969 · SILVER SPRING, MD │   ← Space Mono caption plate, --text-soft on --paper-2
│ SOURCE: KINNEY FAMILY    │      hairline --line rule above
└──────────────────────────┘
```

**Why this and not something else:** the surviving photographs of Soke Kinney are few,
low-resolution, and of uncertain provenance. Trying to hide that produces a site that
looks poorly made. Presenting them as records — dated, sourced, bounded — makes the
scarcity legible as history rather than as neglect, and gives the site a visual identity
that no other martial arts site has. It also creates a natural slot for new photographs as
they surface.

Caption fields: `year` · `location` · `source`. Any field may be omitted; the plate
renders whatever exists. If nothing is known, the plate reads `DATE UNKNOWN`.

### 4.6 Motion

Restrained. Fade-and-rise on scroll for section entry (16px, 400ms, ease-out), staggered
by 60ms within a group. Nothing else. No parallax, no counters ticking up, no carousels.
Respect `prefers-reduced-motion` by disabling all of it.

### 4.7 Logo usage

| Asset | Use |
|---|---|
| Memorial patch (`memorial_patch.svg`) | Home hero, Story page opener, footer, donation receipt. Large only — 200px minimum. |
| Derived wordmark | Site header. "Soke Kinney Memorial Fund" set in Newsreader, optionally with a simplified ring mark lifted from the patch. |
| Kinney Karate logo (portrait enso) | Footer, at generous size, as the link to the school. Not in the header. |

**Do not put the patch in the nav.** It is a dense circular badge with arced lettering; at
40px the text ring is illegible. The header needs a wordmark.

---

## 5. Page specifications

### 5.1 `/` Home

| Section | Content |
|---|---|
| Hero | Memorial patch at scale + wordmark + `1952 – 2014` in Space Mono/gold on ink. No photograph — full-bleed photography exposes the resolution problem. |
| In memoriam | The painted portrait (`michael_kinney_logo.jpg`, 480×600, card size) + 2–3 sentences. Link: "Read his story" → `/story`. |
| Mission | The two existing mission paragraphs, carried over verbatim. |
| Impact | Ink band. Figures in Newsreader display size, labels in Space Mono. **Renders only if data exists — see §9.** |
| Upcoming events | Next 3 events from the calendar Worker. Link → `/events`. |
| Donate CTA | Single primary action → `/donate`. |

### 5.2 `/story` The Story of Soke Michael Kinney

The most important page on the site and currently the weakest. Structure as a
decade-by-decade timeline: vertical rule, years set in Space Mono, prose in Newsreader,
record-framed photographs inline at the relevant decade.

Spine (see §8 for the verified fact base):

```
1952            Born
1963            Begins training, Silver Spring MD — Ju-Jitsu, then Tang Soo Do
1964            Father dies; mother arranges lower-cost YMCA lessons
1969            First TKA black belt, age 18, under Dale Tompkins
1970s           TKA to 50+ locations, 2,000+ students by 1975
1968–1980       East coast tournament circuit
1970–1980       Coaches TKA team — undefeated 9 years
1980            Moves to St. Petersburg; Kinney Karate begins
1980s–2010s     City recreation program, television, honors
2014            Dies October 6
```

**Content warning for the builder:** the existing Story page contains first-person
material in Michael's own voice that did not come through in an automated fetch. That
writing is the best on the site and must be preserved. Confirm the live page contents
before migrating. **Blocked pending owner review — see §10.**

**Sourcing rule:** facts from third-party articles (USAdojo, ashidakim.com,
daelmartialarts.com) may be used freely. Their prose may not. Write original copy from
the fact base in §8.

### 5.3 `/team` Our Instructors

Five full-time instructors. **This is deliberate** — kinneykarate.com lists eight, three of
whom are not full-time. Do not sync to the KK roster.

| Name | Title | Rank | Photo source |
|---|---|---|---|
| Susan Serota | Soke Dai Grandmaster, Ph.D. | 9th Dan | `kinneykarate.com/instructors/Susan.png` |
| Seth Koehler | Grandmaster | 8th Dan | `kinneykarate.com/instructors/Seth.png` |
| Kelly Bonyata | Master Instructor | 4th Dan | `kinneykarate.com/instructors/Kelly2.png` |
| Sonja Leone | Master Instructor | 4th Dan | `kinneykarate.com/instructors/Sonja.png` |
| Tatsiana Haverkamp | Instructor | 3rd Dan | `kinneykarate.com/instructors/Tats.png` |

Bios exist on the KK instructors page and carry over. Photo cards, not the current bare
list. Rehost images to R2; do not hotlink.

### 5.4 `/events`

Calendar-driven. No manual event entries.

- Source: Google Calendar ID
  `20021f27cd27f12f731fe905472b888dee81c6b91f2f1810009e59ddf11d49ca@group.calendar.google.com`
- Worker proxy with KV caching (reuse the kinneykarate.com pattern).
- **Do not embed Google's iframe.** Render events natively.
- Empty state: "No events scheduled right now. Follow us on Facebook for announcements."

### 5.5 `/donate`

See §6 for the full donation spec.

| Section | Content |
|---|---|
| Hero | `image-asset__14_.jpeg` — Soke Kinney handing a certificate to a small child. Record-framed, native size, not full-bleed. This image is the mission. |
| Why give | The five existing appeal blurbs, condensed to three. Current copy is repetitive. |
| Donation form | §6 |
| Trust block | 501(c)(3) status, EIN 81-2108510, FL registration CH84123, mailing address. |

### 5.6 `/sponsors` Community Partnerships

Existing intro line plus current sponsors: Alesia on Central, John Spinks, Bellhops.
Only Alesia has a logo. Card layout tolerates a name-only card; do not fabricate marks.
Add a "Become a sponsor" block linking to `/contact`.

### 5.7 `/contact`

Replace the embedded Google Form with a native form → Worker → Resend →
`sokekinneymemorialfund@gmail.com`.

Fields: name, email, message, and a topic select (General / Donations / Sponsorship /
**Photos of Soke Kinney**).

That last option is deliberate. The people most likely to hold unseen photographs are the
people who will visit this site. Add a short standing invitation on `/story` explaining
that images were gathered from students, families, and old albums, and inviting more.

Spam control: Turnstile. Honeypot field. Rate limit at the Worker.

---

## 6. Donation system

### 6.1 Flow

**Stripe Checkout, hosted.** Confirmed by owner. Handles Apple Pay / Google Pay, card
receipts, and SCA without custom UI work.

```
/donate form
   → POST /api/checkout (Worker)
   → creates Stripe Checkout Session
   → redirect to Stripe
   → success_url → /thank-you?session_id={CHECKOUT_SESSION_ID}
   → Stripe webhook → Worker → D1 ledger → Resend receipt
```

### 6.2 Form

| Control | Behavior |
|---|---|
| Frequency | One-time / Monthly toggle. Drives Checkout `mode`: `payment` vs `subscription`. |
| Amount | Presets $25 / $50 / $100 / $250, plus custom. Minimum $5. |
| Cover the fees | Checkbox, **default ON**. Adds 2.9% + $0.30 as a separate line item. |
| Dedication | Optional text: "In memory of / In honor of…" |
| Public recognition | Checkbox, **default OFF**, labelled "Display my name as a supporter." Anonymous is the default. |
| Employer | Optional, for corporate matching programs. |

**Fee calculation.** Compute so the fund nets the intended amount:

```
gross = (intended + 0.30) / (1 - 0.029)
fee   = gross - intended
```

Round to the cent. Present the fee as its own line item in Checkout so the donor sees
exactly what they are paying.

### 6.3 Recurring

Monthly uses Stripe `mode: 'subscription'` with a `price_data` object created inline —
this avoids maintaining a Product per amount. Fee coverage on a subscription is folded
into the recurring unit amount, not a separate line, because Checkout subscriptions do not
support one-off line items cleanly. Label it clearly in the summary.

### 6.4 Webhooks

Handle at minimum:

- `checkout.session.completed` — record donation, send receipt
- `invoice.paid` — record recurring donation, send receipt
- `invoice.payment_failed` — notify the fund
- `customer.subscription.deleted` — mark lapsed

Verify signatures. Make handlers idempotent on Stripe event ID.

### 6.5 Receipt email

Sent via Resend. Contains:

- Memorial patch, at size
- Amount, date, one-time or recurring
- Dedication text, if given
- Organization name, EIN **81-2108510**, 501(c)(3) status
- Standard acknowledgment that no goods or services were provided in exchange

> **Have the fund's tax preparer confirm the exact acknowledgment wording before launch.**
> IRS substantiation language is not something to improvise, and it is what donors rely on
> at filing time.

### 6.6 `/thank-you`

Confirms the gift, shows the dedication back to the donor, offers a Facebook share, and
links to `/story`. No upsell.

---

## 7. Data model (D1)

```sql
CREATE TABLE donations (
  id                  TEXT PRIMARY KEY,        -- Stripe session or invoice id
  stripe_event_id     TEXT UNIQUE NOT NULL,    -- idempotency
  stripe_customer_id  TEXT,
  amount_intended     INTEGER NOT NULL,        -- cents, before fee coverage
  amount_charged      INTEGER NOT NULL,        -- cents, total
  fee_covered         INTEGER NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'usd',
  frequency           TEXT NOT NULL,           -- 'one_time' | 'monthly'
  donor_name          TEXT,
  donor_email         TEXT,
  employer            TEXT,
  dedication          TEXT,
  public_recognition  INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL,           -- 'succeeded' | 'failed' | 'refunded'
  created_at          TEXT NOT NULL
);

CREATE TABLE contact_submissions (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  topic      TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

The ledger is append-only. Corrections are new rows, never updates.

`public_recognition` is captured from day one but **not displayed in v1**. With anonymous
as the default, a donor wall would look sparse. Hold the data until the opt-in rate is
known.

---

## 8. Verified fact base

Use this rather than any single source. Where sources conflict, the resolution and reason
are given.

### Biography

- Born **1952**. Died **October 6, 2014**, in his sleep, age 62.
- Began training **1963**, Silver Spring, Maryland — **Ju-Jitsu first, then Tang Soo Do**.
- First teacher: **Grand Master Ki Whang Kim** (b. Seoul, 1920), founder of the Tang Soo Do
  Karate Association, US chairman of the Tang Soo Do Moo Duk Kwan Association and of the
  US Olympic Taekwondo team.
- Father died **late 1964**. His mother, working three jobs, arranged lower-cost lessons
  from one of Mr. Kim's black belts at the YMCA.
- Brown belt for four years — no junior black belt existed; he had to wait until 18.
- **1969:** received the **first TKA black belt**, studying under **Dale Tompkins**. Became
  chief black belt instructor of the new school.
- TKA grew to **50+ locations and 2,000+ students by 1975**; first school to contract into
  recreation centers and school gymnasiums.
- **1968–1980:** east coast tournament circuit. **1970–1980:** coached and competed on the
  TKA team — undefeated nine years. Co-promoted the **Eastern Regional Karate
  Championships**, debuting 1970.
- **1980:** moved to St. Petersburg when his parents retired there. Offered a small back
  room by the city Recreation Department; within three months the program had taken over
  the gym, and it later went city-wide.
- Kinney Karate ran the city recreation department's program for **30+ years**, credited as
  instrumental in St. Petersburg winning a national **All-American City** award.
- **10th Degree Black Belt.** The title *Soke* denotes founder/head of system.
- Television: NBC's *Today Show*, ABC's *Wide World of Sports*. Hosted *Kinney Karate
  World*, produced by Group W.
- Press: *Black Belt*, *Karate Illustrated*, *Professional Karate*, *Inside Kung Fu*,
  *U.S. News and World Report*, *Washington Post Magazine*.
- Received a national volunteer award from President Obama.
- At his death: nine locations, 600+ students.
- Celebration of life: Northwest Community Center, St. Petersburg, October 19, 2014.

### Resolved conflicts

| Question | Resolution | Reason |
|---|---|---|
| Founded 1968 or 1969? | **1969** | Site, Yelp listing, and school materials all say 1969. The 1968 on the older KK logo is wrong — flag as legacy, do not propagate. |
| Moved 1979 or 1980? | **1980** | Majority of sources. 1979 likely the decision, 1980 the arrival. |
| Chief instructor 1965? | **Omit** | A 1952 birth makes him 13. Almost certainly a typo in the USAdojo article. The fund's own account places it after 1969. |
| 1,000 or 2,000 black belts? | **"More than a thousand"** | Sources disagree and doubling in two years is implausible. A 501(c)(3) is held to a higher standard than a seminar bio. Take the conservative figure. |
| Tens or hundreds of thousands of students? | **"Tens of thousands"** | Same reasoning. |
| Founding year on the logo | 1968 is **wrong** | Do not reintroduce. |

### Sourcing caution

The 2012 hall-of-honors page (ashidakim.com) carries a bio that reads as supplied
promotional copy, on a site whose surrounding content is uneven. Prefer independently
checkable credentials — the TKA lineage, the network television appearances, the named
magazines, the city recreation program, the Obama volunteer award — and name two or three
strong honors rather than listing every hall of fame. A short list reads as more
distinguished than a long one.

---

## 9. Assets

### 9.1 Constraint

**No supplied photograph exceeds 960px wide.** These are the surviving images of Soke
Kinney; better originals may not exist. Design accordingly:

- **Cap every image at native size.** Enforce in the component. Never upscale.
- **No photographic hero.** Full-bleed exposes low resolution worst.
- **No AI upscaling of Soke Kinney.** Upscalers invent detail rather than recover it. On
  the face of a man who has died, with no better reference available, that means
  presenting a guess as him. Not acceptable on a memorial site.

### 9.2 Manifest

| File | Native | Use |
|---|---|---|
| `memorial_patch.svg` | 1421×1422 (see below) | Hero, Story opener, footer, receipt |
| `image-asset__14_.jpeg` | 640×664 | **Donate hero** — certificate to a child |
| `image-asset__1_.jpeg` | 960×637 | Home mission / Story, St. Pete era |
| `michael_kinney_logo.jpg` | 480×600 | Painted portrait — in memoriam block |
| `michaelandkid3.jpg` | 206×325 | 1960s–70s era inset, small, period-framed |
| `image-asset__3_.jpeg` | 300×261 | Gallery |
| `image-asset__9_.jpeg` | 300×392 | Gallery — formal portrait |
| `image-asset__10_.jpeg` | 300×225 | Gallery |
| `Tai_shin_jitsu.jpg` | 278×320 | Patch — see §10 |
| `Balance_Logo.png` | 968×928 | Kinney Karate mark, footer |

### 9.3 The patch SVG

`memorial_patch.svg` is **not vector**. It is a 4 MB SVG wrapping two base64-encoded
1421×1422 PNGs (image + mask). It has the file size of a large raster plus base64 overhead
and none of the scalability.

**Actions:**

1. Export as a plain PNG — roughly a quarter the size, identical output.
2. Request the original artwork from whoever digitized the embroidery. That process almost
   always starts from true vector.
3. Failing that, trace the ring, lettering, and border to real vector. Only the portrait
   needs to stay raster.

Patch reads: **SOKE MICHAEL KINNEY** arced above, **1952 – 2014** below.

### 9.4 Migration

All existing site images are served from `lh7-us.googleusercontent.com` Google Sites CDN
URLs. **These die when the Sites instance is taken down.** Download and rehost to R2
before any cutover. Serve WebP with original-format fallback.

### 9.5 Video

Two YouTube videos exist on the USAdojo obituary (`XsyymU5Vt3w`, `R5LUIIH1t3o` — the
second appears to be from the celebration of life). Video sidesteps the still-image
resolution problem entirely and would strengthen `/story` considerably. Embed with a
click-to-load facade so the page does not load YouTube on first paint.

---

## 10. Open items

| # | Item | Blocks | Owner |
|---|---|---|---|
| 1 | **Confirm live `/story` page contents.** First-person material in Michael's voice did not surface in automated fetch. It is the best writing on the site. | `/story` content migration | Owner |
| 2 | **Fund impact numbers** — scholarships awarded, students supported, dollars distributed. | Impact section renders only when populated. Build it to degrade to nothing. | Owner |
| 3 | **Board of directors.** Unknown. `/leadership` stubbed, unlinked. Matters for larger donors, grantmakers, and corporate matching. | Nothing in v1 | Owner |
| 4 | **Vector source for the patch.** | Asset quality only | Owner |
| 5 | **Tai Shin Doh.** A patch reading "Tai Shin Doh International Hombu U.S.A." exists in the assets, but the system appears nowhere on either site. If Soke Kinney founded or headed it, that is a significant omission from the biography — *Soke* implies founder of a system, and neither site currently says of what. | `/story` completeness | Owner |
| 6 | **Tax acknowledgment wording** for receipts, confirmed by the fund's preparer. | Receipt email | Owner + preparer |
| 7 | **Permission** from USAdojo to rehost their 720×400 photo and embed video, or link with credit instead. | Optional `/story` assets | Owner |
| 8 | **Higher-resolution originals** — search ongoing. Facebook page, original photographers, family albums. | Nothing; design assumes current files | Owner |

---

## 11. Out of scope for v1

- Donor wall (data captured, not displayed — see §7)
- Board / leadership page (stubbed)
- Merchandise or store — the memorial patch is sold through the Kinney Karate store and
  stays there
- Event registration or ticketing
- Newsletter signup
- Member or donor login

---

## 12. Quality floor

- Responsive to 320px
- Visible keyboard focus on all interactive elements
- `prefers-reduced-motion` respected
- All images have real alt text — for archival photographs, describe what is shown and
  when
- Lighthouse: 95+ performance, 100 accessibility
- Meta and Open Graph tags per page; patch as the default OG image
- `sitemap.xml` and `robots.txt`
- Organization schema.org JSON-LD, including `nonprofitStatus` and EIN

---

## 13. Footer (sitewide)

```
Soke Kinney Memorial Fund
7627 Par Avenue North, St. Petersburg, FL 33710
727-686-0864 · sokekinneymemorialfund@gmail.com
EIN 81-2108510 · 501(c)(3) nonprofit

Facebook · Donate · The school he founded → kinneykarate.com
```

The Kinney Karate link is worded as a relationship, not a nav item.
```
