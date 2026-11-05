import "server-only";
import type { RowDataPacket } from "mysql2";
import { randomUUID } from "node:crypto";
import { getPlan, type PlanId } from "./premium-plans";
import { getDbPool as getPool } from "./db-pool";
import { premiumEntitlementState } from "./premium-entitlement";

export async function isUserPremium(userId: string): Promise<boolean> {
  const db = getPool();
  if (!db) throw new Error("premium_status_unavailable");
  try {
    // Read the flag and active period together. Status reads cannot undo a concurrent renewal.
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT u.is_premium,
        (SELECT MAX(s.current_period_end) FROM subscriptions s
         WHERE s.user_id = u.id AND s.status = 'active') AS period_end
       FROM users u WHERE u.id = ? LIMIT 1`,
      [userId],
    );
    const user = rows[0] as { is_premium: number; period_end: Date | string | null } | undefined;
    if (!user) return false;
    if (user.is_premium !== 0 && user.is_premium !== 1) throw new Error("premium_status_unavailable");
    return premiumEntitlementState({ isPremium: user.is_premium === 1, periodEnd: user.period_end }) === "active";
  } catch {
    throw new Error("premium_status_unavailable");
  }
}

export async function activatePremium(
  userId: string,
  planId: PlanId,
  provider: string,
  providerRef?: string,
): Promise<void> {
  const db = getPool();
  if (!db) throw new Error("no_db");
  const plan = getPlan(planId);
  const start = new Date();
  const end = new Date(start.getTime() + plan.days * 24 * 60 * 60 * 1000);
  const id = randomUUID();

  await db.execute(`UPDATE users SET is_premium = 1 WHERE id = ?`, [userId]);
  await db.execute(
    `UPDATE subscriptions SET status = 'canceled' WHERE user_id = ? AND status = 'active'`,
    [userId],
  );
  await db.execute(
    `INSERT INTO subscriptions
     (id, user_id, plan, status, provider, provider_ref, current_period_start, current_period_end)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
    [id, userId, planId, provider, providerRef ?? null, start, end],
  );
}

export async function createPremiumOrder(input: {
  userId: string;
  planId: PlanId;
  method: string;
  amountUsd: number;
  cryptoAsset?: string;
  note?: string;
}): Promise<string> {
  const db = getPool();
  if (!db) throw new Error("no_db");
  const id = randomUUID();
  await db.execute(
    `INSERT INTO premium_orders (id, user_id, plan, method, amount_usd, status, crypto_asset, note)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      id,
      input.userId,
      input.planId,
      input.method,
      input.amountUsd,
      input.cryptoAsset ?? null,
      input.note ?? null,
    ],
  );
  return id;
}

export async function markOrderPaid(orderId: string): Promise<{ userId: string; plan: string } | null> {
  const db = getPool();
  if (!db) return null;
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT user_id, plan FROM premium_orders WHERE id = ? LIMIT 1`,
    [orderId],
  );
  const row = rows[0] as { user_id: string; plan: string } | undefined;
  if (!row) return null;
  await db.execute(
    `UPDATE premium_orders SET status = 'paid' WHERE id = ?`,
    [orderId],
  );
  return { userId: row.user_id, plan: row.plan };
}
