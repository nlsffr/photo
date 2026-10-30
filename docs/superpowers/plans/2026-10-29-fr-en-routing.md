# French and English SSR Routing Plan

> **Spec:** `docs/superpowers/specs/2026-10-29-growth-platform.md`

**Goal:** Serve genuinely localized, indexable French and English pages with distinct URLs and correct alternates.

**Architecture:** Top-level `app/[lang]` would conflict with existing `app/[handle]`. Use route groups with explicit `/en` and `/fr` roots and multiple root layouts so `<html lang>` is correct without making all pages request-dynamic. Share feature components and server dictionaries. Keep APIs, assets, sitemaps, and bot endpoints outside locale routing.

### Task 1: Locale policy and dictionaries

**Files:**
- Create: `src/lib/i18n/config.ts`
- Create: `src/lib/i18n/dictionaries/en.ts`
- Create: `src/lib/i18n/dictionaries/fr.ts`
- Test: `tests/i18n-policy.test.ts`

1. Test allowlist, prefix/strip helpers, alternates, Accept-Language fallback, and system-path exclusions.
2. Add complete server dictionaries for the shell, homepage, filters, auth, premium, contact, models, and legal metadata.

### Task 2: Explicit locale roots

**Files:**
- Create route groups/root layouts for existing default routes and explicit `src/app/(en)/en/...`, `src/app/(fr)/fr/...`
- Extract shared page implementations under `src/features/...`
- Replace: `src/middleware.ts` with `src/proxy.ts`
- Test: `tests/i18n-routing.test.ts`

1. Test `/en`, `/fr`, deliberate unprefixed behavior, and exclusions for `/api`, `/_next`, assets, `robots.txt`, and sitemaps.
2. Render static `<html lang="en">`/`<html lang="fr">` in the appropriate root layout.
3. Accept the documented full page load when switching between multiple root layouts.

### Task 3: Metadata and links

**Files:**
- Modify: `src/components/AppShell.tsx`
- Modify: `src/components/LocaleProvider.tsx`
- Modify: shared feature pages
- Modify: `src/lib/seo-policy.ts`
- Test: `tests/metadata-alternates.test.ts`

1. Test self-canonical, reciprocal English/French, and `x-default`.
2. Translate visible navigation, headings, descriptions, forms, and SEO metadata—not only the menu.
3. Make the locale switcher keep the equivalent current path.

### Task 4: Sitemap alternates

**Files:**
- Modify sitemap routes and `src/lib/sitemap-data.ts`
- Modify: `tests/sitemap-xml.test.ts`

1. Emit reciprocal alternates only for pages whose main content is actually translated.
2. Do not create thin localized media duplicates until their primary content is localized.

### Task 5: Verify and commit

1. Run focused i18n/sitemap tests, all Node tests, and `npm run build`.
2. Browser-test `/en` and `/fr` on desktop/mobile.
3. Curl SSR HTML and assert `lang`, title, canonical, and hreflang.
4. Commit: `feat: add indexable French and English routes`.

