import "server-only";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { randomUUID } from "node:crypto";
import { getPlan, type PlanId } from "./premium-plans";

function getPool(): mysql.Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return mysql.createPool({
    uri: url,
    connectionLimit: Number(process.env.DB_POOL_SIZE ?? 10),
    waitForConnections: true,
  });
}

export async function isUserPremium(userId: string): Promise<boolean> {
  const db = getPool();
  if (!db) return false;
  try {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT is_premium FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );
    const u = rows[0] as { is_premium: number } | undefined;
    if (u?.is_premium) {
      // Check subscription not expired if present
      const [subs] = await db.execute<RowDataPacket[]>(
        `SELECT current_period_end FROM subscriptions
         WHERE user_id = ? AND status = 'active'
         ORDER BY current_period_end DESC LIMIT 1`,
        [userId],
      );
      const sub = subs[0] as { current_period_end: Date | string | null } | undefined;
      if (sub?.current_period_end) {
        const end = new Date(sub.current_period_end);
        if (end.getTime() < Date.now()) {
          await db.execute(`UPDATE users SET is_premium = 0 WHERE id = ?`, [userId]);
          await db.execute(
            `UPDATE subscriptions SET status = 'canceled' WHERE user_id = ? AND status = 'active'`,
            [userId],
          );
          return false;
        }
      }
      return true;
    }
    return false;
  } catch {
    return false;
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
