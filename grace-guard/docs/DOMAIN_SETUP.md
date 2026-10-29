# Deploying to portal.gracenguard.com (Vercel + GoDaddy)

The portal runs on Vercel; GoDaddy only needs **one CNAME record** that points
the `portal` subdomain at Vercel. Your main site (`gracenguard.com`) is not
affected.

| Field (GoDaddy) | Value |
|---|---|
| **Type** | `CNAME` |
| **Name** | `portal` (just the word — GoDaddy adds `.gracenguard.com`) |
| **Value** | the target Vercel shows for your project, e.g. `d1d4fc829fe7bc7c.vercel-dns-017.com` — if Vercel shows `cname.vercel-dns.com`, use that |
| **TTL** | `1 Hour` (default) — or `600 seconds` while setting up |

> Vercel now issues a project-specific CNAME target. Always copy the exact
> value from Vercel (step 2) rather than typing it from memory.

---

## 1. Deploy the app on Vercel (once)

1. Vercel → **Add New → Project → Import** the GitHub repository.
2. **Root Directory:** `grace-guard`. Framework preset: Next.js.
3. **Environment Variables** → *Production*:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon key |
   | `NEXT_PUBLIC_SITE_URL` | `https://portal.gracenguard.com` |
   | `ENFORCE_CANONICAL_HOST` | `true` |
   | `ALLOWED_EMAILS` | your email (recommended) |

   Add the same variables to *Preview* **except** `ENFORCE_CANONICAL_HOST`
   (leave it unset there, or preview links would redirect to production).
4. **Deploy.**

## 2. Add the domain in Vercel and copy the CNAME target

1. Project → **Settings → Domains → Add** → type `portal.gracenguard.com` → **Add**.
2. Vercel shows the domain as **Invalid Configuration** and lists the record it
   expects: **Type `CNAME`, Name `portal`, Value `…vercel-dns…com`**.
3. Copy that **Value** exactly. (CLI alternative: `vercel domains inspect portal.gracenguard.com`.)

## 3. Create the CNAME in GoDaddy

1. Sign in at godaddy.com → profile menu → **My Products**.
2. Next to **gracenguard.com**, select **DNS** (or *Manage DNS*).
3. In **DNS Records**, check there is no existing record named `portal`
   (A, AAAA or CNAME). If there is, delete or edit it — a name can only have one CNAME and no other records.
4. Select **Add New Record**:
   - **Type:** `CNAME`
   - **Name:** `portal`
   - **Value:** paste the Vercel target from step 2 (no `https://`, no path)
   - **TTL:** `1 Hour` (or `600 seconds`)
5. **Save.**

> If GoDaddy's DNS page says your domain uses **nameservers from another
> provider** (e.g. Cloudflare), create the same CNAME there instead —
> GoDaddy's records are ignored in that case.

## 4. Verify

1. Wait a few minutes (up to the TTL; rarely longer).
2. From a terminal: `dig portal.gracenguard.com CNAME +short` (macOS/Linux) or
   `nslookup -type=CNAME portal.gracenguard.com` (Windows). It should print the
   Vercel target. If it prints the target **with `.gracenguard.com` appended**,
   the value was entered incorrectly — re-enter it exactly as Vercel shows it.
3. In Vercel → Domains, the entry turns **Valid Configuration** and Vercel
   issues the HTTPS certificate automatically (no action needed in GoDaddy).
4. Optional: in Vercel → Domains, set `portal.gracenguard.com` as the primary
   domain so the `*.vercel.app` address redirects to it.

## 5. Point Supabase Auth at the portal

Supabase → **Authentication → URL Configuration**:

- **Site URL:** `https://portal.gracenguard.com`
- **Redirect URLs:** add `https://portal.gracenguard.com/auth/callback`

Then **Authentication → Sign In / Providers → Email**: turn **off** “Allow new
users to sign up”, and create your login under **Authentication → Users → Add user**.

## 6. Test the gate

1. Open `https://portal.gracenguard.com/` in a private window → you are sent to
   the sign-in screen; no dashboard content is served without a session.
2. Sign in → dashboard. Use **Sign out** in the header → back to the sign-in
   screen; the browser back button does not reveal dashboard data (pages are
   served `Cache-Control: private, no-store` and re-checked on every request).
3. Open the `*.vercel.app` address → redirected to `portal.gracenguard.com`.

---

### How the app targets the domain (for reference)

- `NEXT_PUBLIC_SITE_URL` (default `https://portal.gracenguard.com`) drives auth
  email links, `metadataBase` and the allowed server-action origin
  (`next.config.ts`).
- `src/proxy.ts` → `src/lib/supabase/middleware.ts` runs on every request:
  canonical-host redirect (when `ENFORCE_CANONICAL_HOST=true`), session refresh,
  and the sign-in requirement for every route except `/login`, `/auth/*` and `/setup`.
- The dashboard layout and every server action/export also verify the user
  server-side, and the database enforces row-level security — so even a
  misconfigured proxy cannot expose another user's data.
