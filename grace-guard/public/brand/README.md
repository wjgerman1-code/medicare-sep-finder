# Brand assets

Place your **official** Grace & Guard logo files here. The app never generates
or recreates the GG monogram.

1. Copy your logo (SVG or transparent PNG works best, light-on-dark version for
   the navy sidebar), e.g. `public/brand/logo.svg`.
2. Set `NEXT_PUBLIC_BRAND_LOGO_URL=/brand/logo.svg` in `.env.local` (and in
   Vercel → Project → Settings → Environment Variables).
3. Restart `npm run dev`.

If the variable is blank, the sidebar and login screen show a text wordmark
("Grace & Guard · Life & Health Solutions") instead.
