# Account Verification and Recovery Plan

> **Spec:** `docs/superpowers/specs/2026-10-29-growth-platform.md`

**Goal:** Add email verification and password reset without exposing account existence or storing raw tokens.

**Dependency:** A verified outbound sender (`RESEND_API_KEY` plus `CONTACT_FROM`, or SMTP) must be configured before production email delivery can be claimed.

### Task 1: Token and response policy

**Files:**
- Create: `src/lib/account-token-policy.ts`
- Test: `tests/account-token-policy.test.ts`

1. Test random token creation, hash-only storage, expiry, one-time use, password requirements, and enumeration-safe responses.
2. Implement pure helpers.

### Task 2: Schema and transactions

**Files:**
- Create: `migrations/019-account-recovery.sql`
- Modify: `src/lib/auth-db.ts`
- Modify: `docs/DATABASE.md`

1. Add verification/reset token tables and `email_verified_at`.
2. Add active-token cleanup indexes.
3. Implement atomic consume/update and invalidate existing sessions after password reset.

### Task 3: Routes and pages

**Files:**
- Create: `src/app/api/auth/request-verification/route.ts`
- Create: `src/app/api/auth/verify/route.ts`
- Create: `src/app/api/auth/forgot-password/route.ts`
- Create: `src/app/api/auth/reset-password/route.ts`
- Create localized verification/recovery pages
- Modify: `src/components/AuthForm.tsx`

1. Start with route policy tests.
2. Rate-limit issuance and always return an enumeration-safe response.
3. Send links through the configured provider and never log tokens.

### Task 4: Verify and commit

1. Run focused auth tests, all Node tests, and `npm run build`.
2. Perform a test-account round trip only after the sender is configured.
3. Commit: `feat: add email verification and account recovery`.

