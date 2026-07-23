/**
 * Privacy-preserving logger.
 *
 * In production this is a NO-OP for anything that could contain visitor data.
 * We deliberately do not log requests, IPs, search terms, or user handles.
 * Only truly fatal, non-identifying errors are surfaced (to stderr, which the
 * hardened host is configured not to persist — see docs/DEPLOY.md).
 */

const isProd = process.env.NODE_ENV === "production";

export const log = {
  // Dev-only diagnostics. Silent in prod.
  debug: (...args: unknown[]) => {
    if (!isProd) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (!isProd) console.info(...args);
  },
  // Fatal, non-identifying errors only. Never pass request/user data here.
  fatal: (message: string) => {
    console.error(message);
  },
};
