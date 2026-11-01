#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { lstat, open, unlink } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

function validateOptions({ email, outputFile, siteUrl }) {
  if (typeof email !== "string" || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error("INVALID_EMAIL");
  if (typeof outputFile !== "string" || !isAbsolute(outputFile)) throw Error("INVALID_OUTPUT");
  const site = new URL(siteUrl);
  if (site.protocol !== "https:" || site.username || site.password || site.search || site.hash || site.pathname !== "/") throw Error("INVALID_SITE");
  return { email: email.toLowerCase(), outputFile, origin: site.origin };
}

/** Reserve access only. This never resets a password or grants editor rights. */
export async function prepareSeoEditor(options, connection) {
  const { email, outputFile, origin } = validateOptions(options);
  const directory = await lstat(dirname(outputFile));
  if (!directory.isDirectory() || directory.uid !== process.getuid?.() || (directory.mode & 0o077)) throw Error("PRIVATE_DIRECTORY_REQUIRED");
  const file = await open(outputFile, "wx", 0o600);
  const reserved = await file.stat();
  let transactionOpen = false, committed = false;
  try {
    await connection.beginTransaction(); transactionOpen = true;
    const [rows] = await connection.execute("SELECT id, password_hash FROM users WHERE email = ? FOR UPDATE", [email]);
    const existing = rows[0];
    const editorUserId = existing?.id ?? randomUUID();
    let payload;
    if (existing && existing.password_hash !== null) {
      payload = { editorUserId, activationRequired: false, loginURL: `${origin}/en/connexion?next=%2Fadmin%2Fseo` };
    } else {
      if (!existing) {
        const [inserted] = await connection.execute(
          "INSERT INTO users (id, email, password_hash, username) VALUES (?, ?, NULL, NULL)", [editorUserId, email],
        );
        if (inserted.affectedRows !== 1) throw Error("USER_RESERVATION_FAILED");
      }
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const [inserted] = await connection.execute(
        "INSERT INTO seo_editor_invites (token_hash, user_id, expires_at, used_at) VALUES (?, ?, ?, NULL)",
        [tokenHash, editorUserId, expiresAt],
      );
      if (inserted.affectedRows !== 1) throw Error("INVITATION_FAILED");
      payload = { editorUserId, activationRequired: true,
        activationURL: `${origin}/admin/seo/activate#${token}`, expiresAt: expiresAt.toISOString() };
    }
    await connection.commit(); transactionOpen = false; committed = true;
    await file.writeFile(`${JSON.stringify(payload)}\n`, "utf8");
    await file.sync();
    return { ok: true, editorUserId, activationRequired: payload.activationRequired, outputFile };
  } catch {
    if (transactionOpen) { try { await connection.rollback(); } catch { /* No connection details. */ } }
    // Remove only our still-empty reservation, never another file or a partial
    // private result that may contain the only copy of the activation link.
    try {
      const current = await lstat(outputFile);
      if (current.ino === reserved.ino && current.dev === reserved.dev && current.size === 0) await unlink(outputFile);
    } catch { /* Preserve the original operation outcome. */ }
    throw Error(committed ? "PRIVATE_OUTPUT_FAILED_AFTER_COMMIT" : "PREPARATION_FAILED");
  } finally { try { await file.close(); } catch { /* Already synced or failed. */ } }
}

async function main() {
  let connection;
  try {
    const { values } = parseArgs({ options: { email: { type: "string" }, output: { type: "string" } }, allowPositionals: false });
    const options = { email: values.email, outputFile: values.output, siteUrl: process.env.NEXT_PUBLIC_SITE_URL };
    validateOptions(options);
    if (!process.env.DATABASE_URL) throw Error("DATABASE_REQUIRED");
    const { default: mysql } = await import("mysql2/promise");
    connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, timezone: "Z" });
    const result = await prepareSeoEditor(options, connection);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof Error && error.message === "PRIVATE_OUTPUT_FAILED_AFTER_COMMIT"
      ? error.message : "PREPARATION_FAILED";
    process.stderr.write(`${JSON.stringify({ ok: false, error: code })}\n`);
    process.exitCode = 1;
  } finally { if (connection) { try { await connection.end(); } catch { /* No raw driver errors. */ } } }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
