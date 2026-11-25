# Build plan: Office lunch ordering app

Status: Plan step, for review by the Lead

This plan says **how the app in [spec.md](spec.md) is built**: architecture, data model, environments, and the milestones and pull requests that take the clickable prototype to the real app. It adds no product rule: every behaviour comes from the spec, the look from [design.md](design.md), and every technical choice from [decisions.md](decisions.md) (section "Build", B1–B36). Where this plan and the spec disagree, the spec wins and this plan is fixed.

## How to read a milestone

Each milestone is a **vertical slice**: when it is merged, a person can run its flow end to end on the preview deployment with real sign-in and real data. Each milestone lists:

- **Goal** and **Done when**: the end-to-end run that proves it.
- **Screens** (S-…), **rules** (BR-…) and the **acceptance criteria it completes** (an AC listed here has an automated test at the end of the milestone, and leaves the exception list of `__tests__/spec-coverage.test.ts`, decision X7).
- **Tables** and **server actions** it adds.
- **Reused** prototype files.
- **Tests** and **scenarios**: scenarios are written in [test-scenarios.md](test-scenarios.md) as "Planned" before the code (X6).
- **Lead setup**: what the Lead creates by hand (keys, accounts, settings). Claude never creates or sees a key (B10).
- **Open for the Lead**: cases the spec does not decide yet that this milestone is the first to need, found earlier by `spec-reviewer`, `ask-lead`, `check-and-push` or Claude's zero-questions test (`CLAUDE.md`) (X9); they are asked with `ask-lead` when the milestone starts, before any code. "None" when empty.
- **Pull requests**: small, one concern each; each PR is green on CI and deployable, follows the Git rules of `CLAUDE.md`, and runs `check-and-push` and `open-pr`. Each milestone is a GitHub milestone, and each PR below has a GitHub issue in it that its PR closes; the issue of M6-3 (`dev` → `main`) is closed by hand (G21).

Every PR starts by reading the relevant guide in `node_modules/next/dist/docs/` (AGENTS.md, T5); for sign-in read `01-app/02-guides/authentication.md` and `authentication-with-cache-components.md`, for writes `01-app/01-getting-started/07-mutating-data.md`.

## 1. Architecture

### 1.1 Layout

```
src/
  app/                  routes of the real app (Server Components that load data, then render a screen)
  app/layout.tsx        fonts and <html lang> only (B23)
  app/proto/            the whole clickable prototype, moved here in M1 with no new feature (only the demo label, B36, and the pending state, B32), removed at the end of M5;
                        app/proto/layout.tsx wraps it in the prototype shell with the demo bar
  domain/               pure code, no I/O: moved from src/proto in M1
    types.ts            the data shapes the rules use (src/proto/types.ts before M1-1a, without the prototype-only fields, B24, B29)
    code.ts             orderCode, moved from src/proto/seed.ts (B24)
    logic.ts            every business rule as a pure function (src/proto/logic.ts before M1-1a)
    time.ts, i18n.ts    Vietnam time and the VI/EN messages
    phone.ts            phone normalization (M1), password.ts (M1), vietqr.ts (M3)
  server/
    db/schema.ts        Drizzle tables (section 2)
    db/client.ts        the postgres connection (server only)
    load.ts, save.ts    load a slice of State from the DB / write back what an action changed
    actions/*.ts        Server Actions, one file per area ('use server')
    queries/*.ts        reads for pages
    auth/*.ts           the AuthProvider interface with its Supabase and test versions, session, role (B25)
    clock.ts            the current time, replaceable in tests
  screens/, components/ kept from the prototype; the real app has its own shell (AppShell without the demo bar); each screen moves from the prototype data to the real data in its milestone
  proxy.ts              redirects only (signed out → sign-in, shop/customer areas); never the real check
```

`src/proto/store.ts`, `seed.ts`, `types.ts` (`ProtoState`), `ProtoProvider.tsx` (the prototype provider) and the demo bar stay with the prototype under `/proto` until the last PR of M5.

### 1.2 One interface for screens: `useApp()` and `useActions()` (B2)

Before PR M1-1a, screens called `useApp()` for `{ s, m, money }` and `run((s) => logic.fn(s, …))` for actions. In M1 (PR M1-1a) this became two hooks with two providers:

- `useApp()` returns `{ s, m, money, now }`, where `s` is a `State` slice. The prototype provider reads localStorage as today; the real provider gets the slice from the page (a Server Component loads it and passes it as a prop to the client provider). It also returns `shopDay` and `drafts` (B35), and `href()` with the provider's base path and `route()`, which takes that base path off the current path for matching the menus (B34).
- `useActions()` returns named actions (`placeOrder(date, buildingId, note)`, `confirmOrder(id)`, …) with the same arguments as the functions in `logic.ts`. Each returns a Promise in both providers (B23): the prototype provider runs the function on the local state, the real provider calls the matching Server Action, then the page refreshes. It also has `setShopDay(d)`, `startEdit(id)`, `setDraft(id, draft)` and `discardEdit(id)` (B35), `setLang(lang)` (the `setLang` Server Action of M1), and `pending`, true while an action runs (B32).

So a screen moves to real data by changing its page and provider; its markup changes only where it calls an action: before PR M1-1a, 30 places called `run(...)` and read `.ok` at once, and each became `await` with a pending state (buttons disabled while waiting). M1-1a made that change for every prototype screen, so later milestones only swap the provider.

### 1.3 How a write works (B6, B20)

Every write is a Server Action:

1. Check the session and the role (customer or shop); refuse otherwise.
2. Open one transaction. Lock the rows the action changes (`SELECT … FOR UPDATE` on the orders concerned; for placing an order, the `order_counters` row of that day; for shop settings, the settings row).
3. `load.ts` builds the `State` slice the rule needs (settings, groups, dishes, the service days of the week, the buildings, the customers concerned, the orders concerned with their lines, history, reports and refunds, the cart of that day), with `clock` from `server/clock.ts` and `me` from the session.
4. Run the pure function from `domain/logic.ts`, where each function that creates a record takes `newId`, given random UUIDs (B24, B30). An error code ends the transaction with no write.
5. `save.ts` compares the slice before and after and writes only what changed (insert, update, delete per entity). `load.ts` and `save.ts` are first built in M1-5 for buildings only, and each milestone adds its entities (B24). Then commit and call `refresh()` from `next/cache`.
6. Return `{ ok: true }` or `{ ok: false, error, changed }`.

**Working at the same time (BR-28a, CN-59, CN-60).** From M3 on, every order action sends the `version` of each order it shows (an integer increased on every write). Because step 2 locks and step 3 loads the latest data, the rule is always checked on the latest state. If the rule refuses and the version differs, the result has `changed: true`, and the screen shows "This order has just changed" with the reason of the error code, then the latest order. If the rule accepts, the action is saved even when the version differs. One exception (CN-60): `editOrder` is refused with `changed` when another edit of the same order was saved after the draft was opened (the draft keeps the number of edits in the history when it was opened).

**Edits in progress (CN-29).** The prototype keeps edit drafts in `ProtoState.drafts` (B33). In the real app the draft stays in the browser (React state, copied to `sessionStorage` so a trip to the plate builder keeps it); only "Save" calls `editOrder`, with the whole draft, the order version, the edit count when the draft was opened, and the unit price shown for each added line. The draft stores each added line's price when it was added; every time the edit form is shown it compares them with the current prices and rules, so the customer sees "Price changed from X" before saving (AC64). Lines added in the draft follow BR-11b (CN-60, CN-61): a price that changed is refused with `priceChanged`; a dish off the menu or deactivated with `notOnSale`; a plate that no longer fits the rules with `plateNotFitting`.

**Clock.** `server/clock.ts` exports `now()` returning `{ today, minutes, stamp }` in Asia/Ho_Chi_Minh from `domain/time.ts`. Tests replace it with a fixed time (AC17, AC42, cutoff rules); AC42's "demo time" is this injected time in the real app. There is no demo time in the real app (B7).

**Errors.** Each error code of `logic.ts` has a message in `i18n.ts` already; new codes (sign-in, `changed`, `notOnSale`, `priceChanged`, `plateNotFitting`, `dishInActiveOrders`, form checks) are added the same way, with the exact texts of the spec.

### 1.4 Reads

Pages are Server Components. They read the session, then load data with `server/queries/*` inside `<Suspense>` (with `cacheComponents: true`, uncached per-user data must be inside a Suspense boundary). Nothing per-user is cached. Shop pages load the selected day; customer pages load the customer's week, carts and orders.

### 1.5 Sign-in (B4, B16, B17, CN-58)

- **Supabase Auth** with `@supabase/ssr` cookies. Every account in Supabase is an email account; the phone number lives in `profiles`.
- **Sign-up (phone + password)**: the form asks only phone, email and password (CN-60). Normalize the phone (`domain/phone.ts`), check the password rule (`domain/password.ts`). Look up the phone and the email. (1) Both belong to the same account not yet confirmed: create nothing, show "Check your email to confirm" with "Send again" (CN-60, AC67). (2) The phone and the email match two different accounts and at least one of them is confirmed: each field shows its own message, "This phone number is waiting for its email to be confirmed" with "Send again" for a waiting account, the BR-29a message for a confirmed one; nothing is created (CN-61, AC83). (3) Only a confirmed account matches: its BR-29a message. (4) Only waiting accounts match, one on a single field or two different ones on the phone and the email: delete each of them (their links stop working) and go on (CN-62, CN-63, AC90, AC93). Then `signUp` with email + password. Supabase "Confirm email" is on, so the account cannot sign in until the link is tapped. The `profiles` row (phone, email) is created in the same Server Action; whether an account is confirmed is read from the auth user's email confirmation time (set when the link is tapped), except that a profile marked `needs_password` always counts as not confirmed, because a Google sign-in can set that time (CN-63); name and building are asked on S-C2 after signing in.
- **Sign-in**: the field takes a phone number or an email. A phone is normalized and looked up in `profiles` to find the email; then `signInWithPassword` with that email. Messages (CN-60): no account → "No account with this phone number or email"; a Google account → "This account signs in with Google"; wrong password → "Wrong password"; not confirmed → "You have not confirmed your email" with "Send the confirmation link again".
- **Google**: `signInWithOAuth`; the callback route `/auth/callback` exchanges the code, then runs the **linking guard**: if the user now has an `email` identity and a `google` identity, the Google identity was just joined by Supabase's automatic linking, so the callback unlinks it, signs out and shows the AC49 message; when the phone + password account is not confirmed yet, it shows the AC91 message with "Send the confirmation link again" instead (CN-62). Supabase may treat an OAuth sign-in against an unconfirmed email identity differently (it can drop the unconfirmed identity); M1-3 checks this on the preview project first and keeps the guard on the result, not on one Supabase behaviour: when the callback finds a `profiles` row with `method = password`, not confirmed, for that email, it refuses the Google sign-in: a new auth user (another id) is deleted; on the same user with both identities the Google identity is unlinked; on the same user left with only the Google identity (the password identity was dropped), the session is signed out, the user is kept (its last identity cannot be unlinked), its email confirmation is not trusted, and the profile is marked `needs_password`, and "Send the confirmation link again" sends a recovery link (Supabase `generateLink`, type `recovery`) whose page confirms the email and sets the new password (CN-63, AC94). Before creating the `profiles` row of a new Google user, the callback checks `email` and `pending_email`: an email waiting as another account's new email is refused with "This email is waiting for its confirmation" and the new auth user is deleted (CN-65, AC110). A new Google user with no profile phone goes to profile completion (AC16; from PR M1-5, before it to `/`).
- **Forgot password**: looks up the phone or email, gives the BR-29a messages (and, for an account not confirmed, the CN-60 reminder with no reset link), else `resetPasswordForEmail`; the link opens `/auth/reset`, which sets the new password (password rule).
- **Links**: Supabase settings for the 1-hour expiry and single use; the expired-link page asks for the phone number or email and sends a new link through the same action (CN-61); the 60-second "Send again" wait is enforced in the Server Action (last-sent time per email in `auth_mail_log`) and the button stays disabled until then.
- **Routes and redirects** (B23, CN-64): `/sign-in`, `/sign-up`, `/forgot-password`, `/profile`, `/auth/confirm`, `/auth/reset`, `/auth/expired`, `/auth/callback`. `proxy.ts` sends a visitor not signed in from any real page to `/sign-in?next=<path>`; after signing in, a shop account goes to `/shop`; a customer with an incomplete profile goes to `/profile?next=<path>` and, once it is saved, to `next` (from PR M1-5, which builds the profile; before it, to `/`); any other customer goes to `next` when it is a path of this app, else to `/` (CN-65). `/proto`, `/sign-in`, `/sign-up`, `/forgot-password` and `/auth/*` are open to everyone.
- **Form checks** (CN-64): `domain/phone.ts` accepts, after normalizing, 10 digits starting with 03, 05, 07, 08 or 09, else "Phone number is not valid"; an email that does not look like `x@y.z` gets "Email is not valid"; an empty field "Required"; messages under each field. A field that takes a phone number or an email is an email when it contains "@", else a phone number, and gets the matching check (CN-65). The name is counted in characters after Unicode NFC normalization. These checks run before any lookup.
- **Links**: `/auth/confirm` verifies the `token_hash`, which creates the session, then goes by `type`: `signup` opens `/profile` (CN-64; until PR M1-5 builds the profile, the customer home `/`), `recovery` opens `/auth/reset` to set the password (also the CN-63 recovery link), `email_change` opens `/profile`. An expired or used link opens `/auth/expired?type=…`.
- **Limits**: when Supabase answers that a limit is reached (HTTP 429, or its own rate-limit error), the message is "Too many attempts, please try again in a few minutes" (CN-64). The test sign-in mode has low limits for sign-in and for emails so that X4 and X11 can reach them.
- **Expired-link page** (`/auth/expired?type=…`): for `signup`, a phone or email of a confirmed account gets "Your email is already confirmed, please sign in" and one of no account "No account with this phone number or email" (CN-64), a waiting account a new confirmation link; for `recovery`, a new reset link (CN-61); for `email_change`, a visitor not signed in is first sent to `/sign-in?next=/auth/expired?type=email_change`, then the page sends a new link to the address still waiting, for the account signed in, without a phone-or-email field (CN-65). Same 60-second wait.
- **Reset**: after setting the new password, `signOut({ scope: 'others' })` signs out every other device; this device stays signed in (CN-64).
- **Session**: Supabase's refresh-token session in cookies; the customer stays signed in until "Sign out", which is in the header menu of the real shell (CN-64).
- **Account emails** (BR-29c, B25): PR M1-2 adds `supabase/templates/confirm.html`, `reset.html` and `email-change.html` to the repo, each with the Vietnamese text first and the English text after, and links `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…`; the Lead pastes them into the Supabase dashboard. A test reads the three files for AC104.
- **Role**: `SHOP_EMAILS` (comma list, compared in lower case). A shop account goes to `/shop`, needs no profile and every customer action refuses it (AC57). The role is computed on every request, never stored.
- **Profile changes and completion** (`updateProfile` and `completeProfile` alike): phone change re-checks uniqueness; a phone held by a waiting account is refused with the CN-63 message, without "Send again"; email change uses `updateUser({ email })`, which sends a link to the new address ("Secure email change" is off in Supabase, so only the new address confirms, BR-29a); `profiles.email` is updated from the auth user after confirmation (on the next request). A Google account's email field is read-only. An email in `SHOP_EMAILS` is refused with "This email is for a shop account" (CN-60); an email held by a waiting account with "This email is waiting for its confirmation", without "Send again" (CN-64). While a new email waits, it is kept in `profiles.pending_email` (unique together with `email`, so it counts as taken: another sign-up or profile change to it gets "This email is waiting for its confirmation", CN-65) and the profile shows "Waiting for confirmation of …" with "Send again", no cancel (CN-64). The name is required, at most 80 characters, prefilled from Google's name for a Google account; a proposed building needs a name, not an address (CN-64).

### 1.6 Payment QR (B18)

`domain/vietqr.ts` builds the VietQR (NAPAS EMVCo) payload: bank BIN and account from the shop settings, the amount, and the order code in the transfer note, with the CRC16 checksum. The QR is drawn with the `qrcode` npm package on the client. The shop picks its bank from a list of Vietnamese banks with their BINs in `domain/banks.ts` (S-S4, CN-60). Every QR is built when shown, from the current settings, so it always carries the current bank (CN-61). No external QR service.

### 1.7 Files (B15)

Supabase Storage, two buckets, both private, read through signed URLs created by the server:

- `dish-photos` (M2): the shop's dish photos (BR-6a).
- `refund-qr` (M4): the customer's refund QR photos (CN-33).

Photos are shrunk in the browser before upload (longest side 1,200 px, JPEG), with no message, as the prototype already does for QR photos (at 480 px there); a HEIC photo is first converted to JPG in the browser with a free decoder library (`heic2any`, MIT), and one that cannot be converted is refused (CN-61); a file that is not an image is refused with "Only images (JPG, PNG)" (BR-29b). As a safety net the server also refuses anything that is not an image or is over 2 MB after shrinking, which the app's own upload never sends.

### 1.8 Language (BR-30)

The language is kept in a `lang` cookie for every visitor and in `profiles.lang` for signed-in accounts; signing in copies the account's language to the cookie, so the account wins (CN-60); switching while signed in writes both. `<html lang>` follows it.

## 2. Data model

Postgres on Supabase, defined in `src/server/db/schema.ts` with Drizzle. Money is an `integer` in VND. Dates are `date` in Vietnam time; times of day are minutes after midnight (`integer`); moments are `timestamptz` and shown in Asia/Ho_Chi_Minh. Every table has Row Level Security on and no policy (B14): only the server's database connection reads and writes.

| Table | Columns (main) | Constraints, notes | Milestone |
|---|---|---|---|
| `profiles` | one row for every account, shop and Google accounts included: `id` (= auth user id), `name`, `phone` (10 digits, null until given), `email`, `building_id`, `lang`, `method` (`password` / `google`), `needs_password`, `pending_email`, `created_at` | `phone` unique; `email` and `pending_email` unique across both columns (lower case); phones are shown grouped 4-3-3 by `domain/phone.ts` (CN-60) | M1 |
| `auth_mail_log` | `email`, `kind` (`confirm` / `reset` / `change`), `sent_at` | for the 60-second wait | M1 |
| `buildings` | `id`, `name`, `address`, `delivery_time`, `state` (`approved` / `pending` / `declined`), `proposed_by` | pending visible only to `proposed_by` (CN-25); a profile whose building is declined counts as incomplete (CN-61) | M1 (propose), M2 (add, approve) |
| `building_times` | `building_id`, `until` (date), `time` | earlier delivery times for days past their cutoff when the time changed (BR-18; prototype `Building.past`) | M2 |
| `dish_groups` | `id`, `name`, `min`, `max`, `included`, `extra_fee`, `position` | | M2 |
| `dishes` | `id`, `name`, `description`, `name_en`, `description_en`, `photo_path`, `drawing`, `price` (null = not a fixed dish), `group_id` (null = not a component), `surcharge`, `active` | `drawing` is a key of the drawing set in `components/art.tsx`; the set's "comes with rice" list (today `WITH_RICE`, keyed by prototype dish id) is keyed by drawing | M2 |
| `shop_settings` | one row: `default_cutoff`, `base_price`, `bank_bin`, `bank_account`, `bank_holder`, `reminder_seen_at` | `reminder_seen_at` shared by the whole shop (CN-59) | M2 (M4 for the reminder) |
| `service_days` | `date`, `cutoff` (the day's own override; null = default), `locked_cutoff` (the default that applied when the day passed its cutoff), `closed` | a day has a menu when it has at least one `day_menu` row (BR-3). When the default changes, `saveSettings` writes the old default into `locked_cutoff` for every day already past it, creating the row if needed, so those days keep it (CN-61); a day not yet past it takes the new default, even an earlier one, which closes it at once (CN-62) | M2 |
| `day_menu` | `date`, `dish_id`, `kind` (`fixed` / `component`) | primary key of all three | M2 |
| `cart_lines` | `id`, `customer_id`, `date`, `kind`, `dish_id`, `picks` (uuid[]), `qty`, `added_price`, `position` | `added_price` only for "Price changed from X" (BR-11b) | M3 |
| `order_counters` | `date`, `last` | the sequence of the order code (CN-20) | M3 |
| `orders` | `id`, `code`, `customer_id`, `date`, `building_id`, `note`, `status`, `received`, `missing` (int[]), `end_reason`, `kept`, `shop_note`, `refund_to` (jsonb), `placed_at`, `version` | `code` unique; index on (`date`, `placed_at`) | M3 |
| `order_lines` | `id`, `order_id`, `kind`, `dish_id`, `picks` (uuid[]), `qty`, `unit_price`, `position` | unit price fixed when placed (BR-6) | M3 |
| `order_history` | `id`, `order_id`, `at`, `kind` (`status` / `edit` / `reportMissing`), `data` (jsonb) | same shapes as `HistoryEntry` in `domain/types.ts` | M3 |
| `transfer_reports` | `id`, `order_id`, `amount`, `at` | open reports only; answered reports are deleted and recorded in `payments` | M3 |
| `payments` | `id`, `order_id`, `kind` (`received` / `receivedRest` / `notReceived`), `amount`, `reported_amount`, `reported_at`, `at`, `by` (shop account) | the payment record of spec §3: when and how much the customer reported, and the time and account of each answer | M3 |
| `refunds` | `id`, `order_id`, `amount`, `reason`, `created_at`, `refunded_at`, `refunded_by`, `method` | | M4 |

The customer's phone and name on shop screens are always read from `profiles`, never copied into `orders` (CN-58).

Migrations are generated with `drizzle-kit generate` into `drizzle/`, committed with the PR that needs them, and applied by the Lead with `npm run db:migrate` against the preview project before trying the preview, and against production before the release (B13). While PRs share the preview project, a migration only adds tables, columns and indexes; it never deletes or changes existing ones (B21). The Lead runs a PR's migration when trying that PR's preview.

## 3. Environments and secrets

Two Supabase projects (B9): **preview** (Vercel preview deployments and local development) and **production** (`main`). The repo holds only names; values are set by the Lead.

| Variable | Where | Used for |
|---|---|---|
| `DATABASE_URL` | Vercel (preview, production), `.env.local` | Postgres through the Supabase pooler, transaction mode (B12) |
| `NEXT_PUBLIC_SUPABASE_URL` | same | Supabase Auth and Storage |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | Supabase Auth in the browser and on the server |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel, `.env.local` (server only) | signed URLs, unlinking an identity, reading auth users |
| `SHOP_EMAILS` | same | shop accounts (CN-4, CN-58) |
| `NEXT_PUBLIC_SITE_URL` | same | links in emails and the OAuth callback |

Set in the Supabase dashboard, not in the repo: Google OAuth client id and secret (created by the Lead in Google Cloud), Resend SMTP (host, user, the Resend API key as password, sender), "Confirm email" on, "Secure email change" off, email link expiry 1 hour, the Site URL and the redirect URLs of the preview and production sites, the three email templates of `supabase/templates/` (B25), and the auth rate limits (emails per hour high enough for the trial once custom SMTP is on).

This table is the only list of the variable names; there is no example environment file (B22). Environment files are git-ignored and Claude never reads or writes them (G10). CI needs no secret: the DB tests run on PGlite and Playwright runs against a local server with PGlite and a fake auth provider (section 4).

## 4. Tests

| Kind | Tool | What | In CI |
|---|---|---|---|
| Rules | Vitest | the pure functions of `domain/` (today's `prototype-logic.test.ts`, kept and moved) | yes |
| Server | Vitest + PGlite | `load.ts`, `save.ts`, each Server Action against an in-memory Postgres with the migrations applied; locking and `changed` | yes |
| Screens | Vitest + Testing Library | screens with the prototype provider or a fake real provider (today's `screens.test.tsx`, `design.test.tsx`) | yes |
| Browser | Playwright (`npm run test:e2e`, Chromium only, B25) | the scenarios of each milestone, against `next start` with `DATABASE_URL` pointing at a PGlite server (`@electric-sql/pglite-socket`, migrations applied at start) and a test sign-in mode that signs in seeded accounts, issues confirmation, reset and email-change links into a test mailbox table, and simulates Google callbacks, all without Supabase. Because `next build` fixes `NODE_ENV` to `production`, the mode is read at run time from a dedicated variable (`E2E_TEST_AUTH=1`) and works only when `VERCEL_ENV` is unset and no Supabase key is set; the server refuses to start if `E2E_TEST_AUTH` is set together with a Supabase key (checked in `instrumentation.ts`); the test version of the `AuthProvider` interface does all of this, keeps one session per browser context and supports signing out the other sessions (X6) (B25) | yes, from M1-1c: the `ci` job runs `npm run test:e2e` after the build, and it is the sixth command of the **Check** in `CLAUDE.md` (C1) |
| Layout | Playwright | every real screen (and the `/proto` screens until M5-4, B28) at 375 px and 1280 px: `scrollWidth <= clientWidth` (AC19, BR-31, B11) | yes, from M1-1c, which runs it on the prototype screens under `/proto` (B28); from M1-2 each milestone adds its real screens to the list, M5-4 removes the `/proto` screens from it, and AC19 is completed in M6 when every screen is in it |

The real Supabase Auth flows (sending emails, Google itself) cannot run in CI; the test sign-in mode stands in for them, and their own logic (phone lookup, messages, linking guard, role) is tested with a fake Supabase client, and the Lead tries the real flow on the preview (section 6).

**Moving the scenarios to Playwright (B19).** From M1 on, every new scenario that clicks through screens is written as a Playwright test in the same PR, and its "How run" is "Playwright". The prototype's "Browser" and "Both" scenarios (sections 1–12 of `test-scenarios.md`) are ported to Playwright in the PR that moves their screen to real data, and set to "Playwright". By the end of M6 only visual checks stay "Browser" (dark mode, UI-12). Each milestone below lists the scenarios it ports or adds.

## 5. Transition: which screen uses which data (B7)

During M1–M5 the prototype keeps working **as a whole** under `/proto` (all its screens, its fake data in localStorage and its demo bar, which now says "Prototype data"), so the Lead can still click through a full day there. The real app grows at the final routes; each milestone is runnable end to end on its own, and a real screen never reads the prototype store. The menus of the real app show only the screens that are real in that milestone; a link "Open the prototype" in the footer leads to `/proto` until the end of M5. Apart from that footer link and the two homes of M1, there is no link from a real screen into a prototype screen.

"Proto" = the screen runs only under `/proto` on fake data; "Real" = the screen runs at its final route on Supabase data, with the real clock and the account's role.

| Screen | M1 | M2 | M3 | M4 | M5 |
|---|---|---|---|---|---|
| S-C1 Sign in / Sign up | Real | Real | Real | Real | Real |
| S-C1a Forgot password | Real | Real | Real | Real | Real |
| S-C2 Profile | Real | Real | Real | Real | Real |
| S-C3 Week view | Proto | Real | Real | Real | Real |
| S-C4 Day menu | Proto | Real (no "Add") | Real | Real | Real |
| S-C5 Plate builder | Proto | Real (price only, no "Add") | Real | Real (+ adding to an edit) | Real |
| S-C6 Cart and checkout | Proto | Proto | Real | Real | Real |
| S-C7 Payment | Proto | Proto | Real | Real | Real |
| S-C8 My orders | Proto | Proto | Real | Real | Real |
| S-C9 Order detail | Proto | Proto | Real (view) | Real (+ edit, cancel, refund) | Real |
| S-S1 Dishes | — | Real | Real (+ deactivate guard) | Real | Real |
| S-S2 Build-your-own rules | — | Real | Real | Real | Real |
| S-S3 Days | — | Real (menu, cutoff override) | Real (+ removal guard) | Real | Real (+ "Mark closed") |
| S-S4 Settings | — | Real | Real | Real | Real |
| S-S5 Buildings | Proto | Real (add, approve, delivery time) | Real | Real (+ decline) | Real |
| S-S6 Orders | Proto | Proto | Real (confirm, payment answers, search) | Real (+ reject, refund shown) | Real (+ "kept" mark, select and start preparing) |
| S-S7 Cutoff review | Proto | Proto | Proto | Proto | Real |
| S-S8 Preparation sheet | Proto | Proto | Proto | Proto | Real |
| S-S9 Delivery list | Proto | Proto | Proto | Proto | Real |
| S-S10 Refunds | Proto | Proto | Proto | Real | Real |
| S-S11 Order detail (shop) | Proto | Proto | Real (confirm, payment answers) | Real (+ reject, refunds) | Real (+ keep, start preparing) |
| Refund reminder (BR-21) | Proto | Proto | Proto | Real, on every real shop screen | Real, on every shop screen |

"—" = the screen did not exist in the prototype (P2). In the PR that moves the last screen (M5-4, closing a day on S-S3) `/proto`, `src/proto/store.ts`, `seed.ts`, `types.ts` (`ProtoState`), the prototype provider (`ProtoProvider.tsx`) and the demo bar are removed, and the footer link goes.

## 6. Milestones

Flows: F1 is runnable from M3, F2 and F5 from M4, F3 and F4 from M5. BR-5 (no portion limit) needs no code: nothing counts portions against a limit. BR-31 is checked in every milestone by the layout test.

### M1 Accounts

**Goal.** A visitor signs up with phone + password or Google, confirms the email, signs in with phone or email, resets a forgotten password, completes and changes the profile, proposes a building; shop accounts land on a shop home.

**Done when.** On the preview: account A (phone + password, the Lead's own email) signs up with only phone, email and password, confirms, signs in with `+84…` and with the email, completes the profile with a proposed (pending) building, resets the password; account B (Google, a second email) is sent to profile completion; a Google sign-in with A's email is refused (AC49); the shop account opens `/shop`; the language of the account wins after signing in again.

**Screens.** S-C1, S-C1a, S-C2 in the direction chosen in M1-D; a customer home at `/` (name, building, a link to the prototype) and a shop home at `/shop` (a link to the prototype). Buildings can only be proposed in M1 (BR-16 allows a pending default building); approving comes in M2.
**Rules.** BR-15 (profile asked; ordering comes in M3), BR-16 (propose only), BR-29, BR-29a, BR-29c, BR-30 (app text and the account's language), BR-32 (account emails only).
**Completes.** AC20, AC49, AC50, AC51, AC52, AC53, AC54, AC56, AC67, AC68, AC69, AC70, AC71, AC76, AC83, AC84, AC90, AC91, AC92, AC93, AC94, AC95, AC96, AC97, AC98, AC99, AC100, AC101, AC102, AC103, AC104, AC105, AC106, AC107, AC108, AC109, AC110.
**Tables.** `profiles`, `auth_mail_log`, `buildings` (with `state` and `proposed_by`).
**Server actions.** `signUp`, `signIn`, `signOut`, `sendAgain`, `forgotPassword`, `resetPassword`, `completeProfile`, `updateProfile`, `changeEmail`, `proposeBuilding`, `setLang`; routes `/auth/callback`, `/auth/reset`, `/auth/confirm`.
**Reused.** `domain/i18n.ts`, `components/ui.tsx`, `parts.tsx`, `AppShell.tsx` (the real shell has no demo bar), `screens/customer/BuildingPicker.tsx`, `logic.proposeBuilding`.
**Tests.** `domain/phone.ts` (normalize, display 4-3-3) and `password.ts`; each action on PGlite with a fake Supabase client (duplicate and unconfirmed phone and email, messages, linking guard, role, shop email refused, 60-second wait); Playwright: A1–A13, A15, A16, P6–P10, P15, Q7, Q8, V5, V6, W1–W3, X1–X9, X11–X17; X10 as a Vitest test on the template files; the layout test gets the M1 screens (B28). Each test names the AC id it covers, not only the CN id, because several ACs cite the same CN (X7). Scenarios that need an email link or a Google callback (A1, A5–A7, A10, A12, A16, P8, P15, Q8, V5, V6, W2, W3, X3, X5–X7, X11–X13, X16, X17) run in CI against the test sign-in mode, which also issues confirmation, reset and email-change links (kept in a test mailbox table read by the test) and simulates a Google callback for a given email and identity set; each is also tried once by the Lead on the preview with the real Supabase, Google and Resend (section 7).
**Lead setup.** Before M1-2: create the preview Supabase project; copy its URL, keys and pooler URL into Vercel (preview) and `.env.local`; set `SHOP_EMAILS`; run `npm run db:migrate`; set the Site URL and the redirect URLs. After M1-2 is merged: paste the three email templates of `supabase/templates/` into Supabase. Before M1-3: create the Google OAuth client and enter it in Supabase; add the preview redirect URLs. Before M1-4: create the Resend account, enter its SMTP in Supabase and raise the auth email rate limit. Then the two-email trial of section 7.

**Open for the Lead.** None.

**Pull requests.**
The foundation is split into three PRs (B27); all existing tests stay green after each of them.

1. **M1-1a Move the code and split the layouts**: move `src/proto` rules, types, time and i18n to `src/domain`, with the prototype-only fields in a prototype type, `orderCode` in `src/domain/code.ts` and `nextId` taking an id generator (B24); split the layouts (B23); move all prototype pages under `src/app/proto/` (links get a `/proto` prefix through one `href()` helper); `useApp()`/`useActions()` with the prototype provider, every screen awaiting its actions with a pending state (section 1.2); `spec-reviewer` updated for the real app (B26); `page.test.tsx` and the other tests follow the screens under `/proto`.
2. **M1-1b Database**: Drizzle, the PGlite test helper, the first migration (`profiles`, `auth_mail_log`, `buildings`), `npm run db:migrate`.
3. **M1-1c Playwright and CI**: Playwright with the test sign-in mode and the layout test (on the `/proto` screens until real screens exist, B28), `next start` against the PGlite server with the migrations applied at start (section 4), the `AuthProvider` interface with its test version for seeded accounts (B25), `instrumentation.ts`; `npm run test:e2e`, the CI step for it and the sixth **Check** command (C1).
4. **M1-D Design round for the account screens** (UI16): 2–3 directions for S-C1, S-C1a, S-C2 and the reset and expired-link pages, clicked through on fake data like the prototype UI round; the Lead chooses; recorded in `design.md`. No server code.
5. **M1-2 Sign up and sign in with phone or email**, the form checks, email confirmation that signs in, "Send again", the sign-in, limit and expired-link messages, `proxy.ts` sending visitors to `/sign-in` and back, "Sign out" in the header, the three bilingual email templates, the customer home `/` and the shop home `/shop`. The Vietnamese texts of every new message are drafted by Claude and listed in the PR for the Lead to review (CN-64).
6. **M1-3 Google sign-in**, the linking guard, the shop role and the shop/customer redirects in `proxy.ts`.
7. **M1-4 Forgot password** and the reset page, which signs out the other devices.
8. **M1-5 Profile**: completion (S-C2 first when incomplete), name rule and Google prefill, change phone, change email with the pending address shown, propose a building (name only required), language per account; first `load.ts`/`save.ts` for buildings (B24).

### M2 Shop sets up, customer sees the week

**Goal.** The shop enters dishes, the plate rules, settings and the menus of the coming days, and approves buildings; the customer sees the real week, the day menus and the live plate price.

**Done when.** The shop account creates 3 groups and 6 dishes (one with a photo, one with a drawing, one with neither), sets the base price, the default cutoff and the bank, puts up menus for two days with a cutoff override on one, approves account A's pending building with a delivery time; the customer account sees the week with those days open and the others "no menu yet", opens a day, builds a plate and sees its price change, and switches to English (AC18, AC29).

**Screens.** S-S1 (without the deactivate guard, which needs orders: M3), S-S2, S-S3 (menu and cutoff override), S-S4, S-S5 (add, approve, delivery time), S-C3, S-C4 (without "Add"), S-C5 (price and validity, without "Add"). Built with the existing components (UI15).
**Rules.** BR-1, BR-2, BR-3, BR-4 (override and default cutoff changes), BR-6a, BR-7 (with the number checks on S-S1 and S-S2), BR-8, BR-9, BR-16, BR-18, BR-29b (dish photos), BR-30 (English dish names).
**Completes.** AC18, AC29, AC58, AC73, AC77, AC81.
**Tables.** `dish_groups`, `dishes`, `shop_settings`, `service_days`, `day_menu`, `building_times`; bucket `dish-photos`.
**Server actions.** `saveDish`, `setDishActive`, `uploadDishPhoto`, `saveGroup`, `setBasePrice`, `saveSettings` (a new default cutoff applies only to days not yet past their cutoff, CN-61), `setDayMenu`, `setCutoffOverride` (refused after that day's cutoff, BR-4), `addBuilding`, `approveBuilding`, `setDeliveryTime`.
**Reused.** `logic.week`, `dayState`, `cutoffOf`, `platePrice`, `plateValid`, `groupCounts`, `dishName`, `approveBuilding`, `setDeliveryTime`, `deliveryTimeOn`; `WeekScreen`, `DayScreen`, `PlateScreen`, `art.tsx` (`DishArt` takes a photo URL or a drawing key; "comes with rice" keyed by drawing).
**Tests.** Actions on PGlite; Playwright: R1, P12, Q1, Q5, Q19, D14, F8, UI-1, UI-2; the layout test gets these screens.
**Lead setup.** Create the `dish-photos` bucket (private) in the preview project; run the migration.

**Open for the Lead.** None.

**Pull requests.**
1. **M2-1 Dishes and build-your-own rules** (S-S1 with photo and drawing, S-S2 with the checks).
2. **M2-2 Settings and days** (S-S4 with the bank list, S-S3 menus and cutoff override).
3. **M2-3 Adding and approving buildings, delivery times** (S-S5 except decline).
4. **M2-4 Week, day menu and plate builder on real data** (S-C3, S-C4, S-C5 without "Add").

### M3 Order and pay

**Goal.** The customer fills a cart per day, places an order, pays by VietQR and reports the transfer; the shop confirms orders and answers each report; both follow the order. F1 runs end to end.

**Done when.** Account A adds a ready meal and a plate to Monday's cart and a dish to Tuesday's, places Tuesday (Monday's cart unchanged, AC21), scans the QR with a banking app and sees the exact amount, the order code and the shop's bank (AC1, AC75), taps "I have transferred"; the shop finds it on the Orders screen by phone number, taps "Payment received", confirms the order; a second order for the same day has its own QR (AC4); account B (Google, new) is sent to the profile before ordering (AC16); the shop account cannot order (AC57).

**Screens.** S-C4 and S-C5 with "Add", S-C6, S-C7, S-C8, S-C9 (view, history, money block), S-S6 (confirm, payment answers, search and sort), S-S11 (same actions), S-S1 deactivate guard, S-S3 removal guard.
**Rules.** BR-5, BR-6 (prices kept, removal and deactivate guards), BR-10, BR-11, BR-11a, BR-11b (prices, dishes and plate rules), BR-12, BR-15 (ordering blocked until the profile is complete; shop accounts cannot order), BR-17 (confirm blocked while pending), BR-19 (QR with the current bank), BR-22 (confirm), BR-28a (version on every order action), BR-32; CN-56, CN-57 on S-S6.
**Completes.** AC1, AC3, AC4, AC16, AC17, AC21, AC22, AC28, AC34, AC47, AC57, AC59, AC60, AC63, AC65, AC75, AC78, AC79, AC80, AC88.
**Tables.** `cart_lines`, `order_counters`, `orders`, `order_lines`, `order_history`, `transfer_reports`, `payments`.
**Server actions.** `addToCart`, `setCartQty`, `removeCartLine`, `placeOrder` (with the prices shown: `priceChanged` when one differs from the current price, `notOnSale` while a line has a dish off the menu or deactivated, `plateNotFitting` while a plate breaks the current rules, then the order code), `reportTransfer`, `confirmOrder`, `confirmPayment` (with or without a report), `receivedRest`, `reportNotReceived`; guards in `setDishActive` and `setDayMenu` (`dishInActiveOrders`; for both, only orders still to be delivered count: all of them for deactivating, that day's for removing from a day's menu, CN-61, CN-62).
**Reused.** `logic.addToCart`, `setCartQty`, `placeOrder`, `reportTransfer`, `confirmOrder`, `confirmPayment`, `reportNotReceived`, `paymentState`, `owed`, `toPay`, `moneySummary`, `matchesSearch`, `newestFirst`; `CartScreen`, `PayScreen`, `OrdersScreen`, `OrderScreen` (view parts), `ShopOrdersScreen`, `ShopOrderScreen`, `components/money.tsx`.
**New code.** `domain/vietqr.ts`, `domain/banks.ts`.
**Tests.** VietQR payload against two known-good payloads (one built from the NAPAS format description, one decoded from a QR made by a real bank app for a test account), without real account numbers in the repo; actions on PGlite, including two `placeOrder` at once getting different codes and AC17 with the clock in another time zone, plus a Playwright run with the browser's `timezoneId` set to another zone; Playwright: R2, R3, P1, P4, P14, Q2–Q4, Q10, Q14, Q15, V3, A17, A18, D1–D5, S1–S8, F2, F4–F6, F9, UI-3–UI-6, UI-17, UI-18, UI-23; the layout test gets these screens.
**Lead setup.** Run the migration; enter a bank in Settings on the preview.

**Open for the Lead.** None.

**Pull requests.**
1. **M3-1 Carts and placing an order** (S-C4/S-C5 "Add", S-C6, order code, price and on-sale checks, the dish guards).
2. **M3-2 Payment screen and VietQR**, "I have transferred", My orders, Order detail view (S-C7, S-C8, S-C9).
3. **M3-3 Shop Orders and shop Order detail** with confirm and the payment answers (S-S6, S-S11).
4. **M3-4 Search and sort** on Orders (CN-56, CN-57).

### M4 Edit, cancel and refunds

**Goal.** The customer edits and cancels before the cutoff; the shop rejects; every refund is recorded, recalculated, shown and marked; buildings can be declined. F2 and F5 run end to end.

**Done when.** Account A edits a paid order up (Underpaid, QR for the difference, AC6) and down (Needs refund, AC7), enters a bank account for the refund, cancels another paid order; the shop opens Refunds, sees the destination, marks one Refunded by bank transfer; a pending building with two orders is declined after the preview list (AC24); a second shop account sees "Seen" shared (AC61); the customer's "Save" after a save on another device says "This order has just changed" (AC66).

**Screens.** S-C9 (edit with the plate builder, cancel, refund destination), S-C5 (adding to an edit), S-S6 and S-S11 (reject, pending refunds shown), S-S10, the refund reminder on every real shop screen, S-S5 (decline).
**Rules.** BR-2/BR-11b in edits (CN-60, CN-61; extra portions of a repriced line as a new line and old plates only lowered or removed, CN-62), BR-13, BR-14, BR-15 and BR-16 (a declined default building makes the profile incomplete), BR-17 (decline), BR-20, BR-21 (CN-53 to CN-55; the reminder bar lives in the real shop shell), BR-28a (other saved edits), BR-29b (refund QR photos); sections 4.2 and 4.3; CN-56, CN-57 on S-S10.
**Completes.** AC2, AC5, AC6, AC7, AC8, AC14, AC15, AC24, AC26, AC27, AC30, AC31, AC33, AC36, AC37, AC38, AC39, AC40, AC43, AC45, AC61, AC64, AC66, AC74, AC82, AC85, AC86, AC87.
**Tables.** `refunds`; bucket `refund-qr`.
**Server actions.** `editOrder`, `cancelOrder`, `rejectOrder`, `setRefundTo`, `uploadRefundQr`, `markRefunded`, `seeRefundReminder`, `declineBuilding` (with `declinePreview` as a query).
**Reused.** `logic.editOrder`, `editChanges`, `cancelOrder`, `rejectOrder`, `setRefundTo`, `markRefunded`, `refundReminder`, `seeRefundReminder`, `declinePreview`, `declineBuilding`, `cashAllowed`, `customerRefundMethod`, `pendingRefund`, `refundList`; `OrderScreen` (edit), `RefundsBuildingsScreens.tsx`, `common.tsx`.
**Tests.** Every money combination already in `prototype-logic.test.ts` stays; actions on PGlite for `changed` (AC66, and the shop rejecting while the edit is open), the shared "Seen", prices in edits; Playwright: R4, R6, P2, P3, P5, P13, Q6, Q9, Q11, Q13, Q16, Q18, Q20, D6, D10, D11, M1–M9, M11–M13, M16, M17, M21, F1, F3, F10, S12–S14, S16, T1, UI-7–UI-11, UI-14–UI-16, UI-19–UI-22, V1, V2; M10 and M18 without their closed-day and Delivering cases, which come in M5; the layout test gets these screens.
**Lead setup.** Create the `refund-qr` bucket (private); run the migration; set up a second shop account (section 7).

**Open for the Lead.**
- Ids of lines added to an edit (found by `spec-reviewer` in PR M1-1a). The edit form makes the id of a dish added to an edit on the screen (`new-<dishId>-<n>`, `src/screens/customer/OrderScreen.tsx`), while B30 says functions that create a record take `newId` and section 1.3 saves records with random UUIDs. Nothing changes for the customer or the shop. Options: (a) the server gives a real id to each line it gets with a `new-` id when it saves the edit; (b) the draft actions make the line id through `newId`, as `addPlateToDraft` already does; (c) another choice of the Lead.

**Pull requests.**
1. **M4-1 Editing an order** with the draft, the plate builder, the history and the CN-60 checks (S-C9 edit).
2. **M4-2 Cancel and reject with refund records** and the money block states.
3. **M4-3 Refund destination** with the QR photo upload.
4. **M4-4 Refunds screen and the shared reminder** (S-S10).
5. **M4-5 Declining a building** (S-S5).

### M5 Day run

**Goal.** After the cutoff the shop reviews, cooks, delivers and closes days: one full service day (F3) runs on real data, and closing a day (F4) too.

**Done when.** The Lead runs F3 end to end on the preview with real accounts: cutoff review (confirm, keep, reject), select two orders on the Orders screen and start preparing, preparation sheet, delivery list per building with phones shown 4-3-3, Delivering, Delivered, "Cash given back"; the reminder shows on every shop screen; closing a day with orders rejects them (AC13); the prototype is gone.

**Screens.** S-S7, S-S8, S-S9, S-S3 ("Mark closed"), S-S6 and S-S11 ("kept" mark, keep, select and start preparing).
**Rules.** BR-22, BR-23, BR-24, BR-25, BR-26, BR-27, BR-28; CN-56 on S-S7, the Delivery screen without search (CN-56).
**Completes.** AC9, AC10, AC11, AC12, AC13, AC23, AC25, AC32, AC35, AC41, AC42, AC44, AC46, AC48, AC55, AC62, AC72, AC89.
**Tables.** none new.
**Server actions.** `keepOrder`, `startPreparing` (several ids), `markDelivering`, `markDelivered` (with note), `giveCashBack`, `closeDay`.
**Reused.** `logic.reviewList`, `keepOrder`, `startPreparing`, `markDelivering`, `markDelivered`, `giveCashBack`, `prepSheet`, `deliveryList`, `rejectOrder` with `closedDay`; `ReviewScreen`, `PrepScreen`, `DeliveryScreen`.
**Tests.** Actions on PGlite (several orders in one action, each moving on its own; R7); Playwright: R5, R7, V4, A14, P11, Q12, Q17, S9–S11, S15, F7, F11, D7–D9, D12, M10 and M18 (their closed-day and Delivering cases), M14, M15, M19, M20; the layout test gets these screens.
**Lead setup.** none.

**Open for the Lead.** None.

**Pull requests.**
1. **M5-1 Cutoff review** with keep and search (S-S7) and the "kept" mark on S-S6/S-S11.
2. **M5-2 Start preparing and the preparation sheet** (select on S-S6 and S-S8, S-S8 sheet).
3. **M5-3 Delivery list** with Delivering, Delivered and "Cash given back" (S-S9).
4. **M5-4 Closing a day, and removing the prototype** (B7: the PR that moves the last screen removes the store): S-S3 "Mark closed"; `/proto`, `src/proto/store.ts`, `seed.ts`, `types.ts` (`ProtoState`), the prototype provider (`ProtoProvider.tsx`), the demo bar and the footer link go, and the `/proto` screens leave the layout test (B28); tests that used the prototype provider use the real provider with fixtures.

### M6 Release

**Goal.** The app runs in production and the Lead accepts it with one full service day (D12).

**Done when.** Every acceptance criterion has an automated test and the exception list of `spec-coverage.test.ts` is empty; the Lead's tasks of section 7 marked "before production" are done; the Lead runs one full day on production without records outside the app; the `dev` → `main` PR is merged by the Lead.

**Completes.** AC19.
**Tests.** Playwright: D13, UI-13; UI-12 stays "Browser", checked in dark mode on the real screens (the demo bar is gone).

**Open for the Lead.** None.

**Pull requests.**
1. **M6-1 Layout test complete**: every screen in the 375 px / 1280 px test (AC19); empty the exception list.
2. **M6-2 Production setup notes**: a `docs/release.md` checklist of the production project settings, the migration order and how to roll back a deployment in Vercel.
3. **M6-3 Release** `dev` → `main` (merge commit, G3), after the Lead's full day on the preview.

## 7. The Lead's tasks

Claude does not do these; they need the Lead's accounts, money or decisions.

**During M1: trying sign-in with two different emails while Resend has no domain (B8).** Without a verified domain, Resend sends only to the email of the Resend account owner.

- Account A: phone + password with the Lead's Resend-owner email. It receives the confirmation and reset emails, so AC20, AC51, AC69 and the reset scenarios are tried on A.
- Account B: a second email, either with Google sign-in (no confirmation email is needed) or with phone + password confirmed by the Lead by hand in the preview Supabase dashboard (Authentication → Users). B cannot receive email, so reset is not tried on B.
- The shop account: a third email in `SHOP_EMAILS`, set up like B.
- Changing an email (X7, X12): sign up a fourth account C with another address confirmed by hand in the dashboard, then change C's email to the Lead's Resend-owner email, the only address that receives mail. That address must be free at that moment, so try this before creating A, or delete A in the dashboard first.
- A replaced waiting account (X5): sign up with the Lead's Resend-owner email and do not confirm; sign up again with the same phone number and a second email (this replaces the first, CN-62); open the first link, which no longer works, and enter the Lead's email on the expired-link page: "No account with this phone number or email". Delete these accounts in the dashboard afterwards.

**During M1–M5: migrations.** Run a PR's migration on the preview project when trying that PR's preview; migrations only add while the project is shared (B21).

**After M1-2: email templates.** Paste the three templates of `supabase/templates/` into the Supabase dashboard of the preview project (and of production before M6).

**During M4: a second shop account** (AC61): a fourth email in `SHOP_EMAILS`, set up like B.

**Before a second real customer signs up (required).** Verify a domain on Resend (DNS records added by the Lead) and set the sender to that domain in Supabase SMTP. Until then nobody but the Lead receives confirmation or reset emails, so nobody else can finish signing up. The free plan sends 100 emails a day.

**Before production (M6).**

- Create the production Supabase project, its buckets, Google redirect URLs, SMTP and "Confirm email"; run the migrations; set the production variables in Vercel.
- Publish the Google OAuth consent screen (in testing mode only listed test users can sign in with Google).
- Supabase free plan: the project pauses after 7 days without use and has 500 MB of database and 1 GB of storage. Decide whether to upgrade or accept the pause before real customers rely on it.
- Vercel Hobby plan is for non-commercial use. Decide the plan before opening a real shop.

## 8. Acceptance criteria by milestone

Each acceptance criterion is completed (automated test, out of the exception list) in exactly one milestone: the first one in which every screen and action it needs is real.

| Milestone | Acceptance criteria |
|---|---|
| M1 | AC20, AC49, AC50, AC51, AC52, AC53, AC54, AC56, AC67, AC68, AC69, AC70, AC71, AC76, AC83, AC84, AC90, AC91, AC92, AC93, AC94, AC95, AC96, AC97, AC98, AC99, AC100, AC101, AC102, AC103, AC104, AC105, AC106, AC107, AC108, AC109, AC110 |
| M2 | AC18, AC29, AC58, AC73, AC77, AC81 |
| M3 | AC1, AC3, AC4, AC16, AC17, AC21, AC22, AC28, AC34, AC47, AC57, AC59, AC60, AC63, AC65, AC75, AC78, AC79, AC80, AC88 |
| M4 | AC2, AC5, AC6, AC7, AC8, AC14, AC15, AC24, AC26, AC27, AC30, AC31, AC33, AC36, AC37, AC38, AC39, AC40, AC43, AC45, AC61, AC64, AC66, AC74, AC82, AC85, AC86, AC87 |
| M5 | AC9, AC10, AC11, AC12, AC13, AC23, AC25, AC32, AC35, AC41, AC42, AC44, AC46, AC48, AC55, AC62, AC72, AC89 |
| M6 | AC19 |

ACs whose rules already have a prototype test (for example AC3, AC9) still count as completed only when the real screen and server action are tested in their milestone.
