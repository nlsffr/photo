import { randomUUID } from "node:crypto";
// @ts-expect-error Node strip-types tests require the explicit extension.
import { getPlan, type PlanId } from "./premium-plans.ts";
// @ts-expect-error Node strip-types tests require the explicit extension.
import { buildTelegramDeepLink, createLaunchToken, hashLaunchToken, isLaunchExpired } from "./telegram-payment-policy.ts";

interface DbConnection {
  beginTransaction(): Promise<void>;
  execute(sql: string, params?: unknown): Promise<unknown>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

export interface OrderDb {
  getConnection(): Promise<DbConnection>;
  execute(sql: string, params?: unknown): Promise<unknown>;
}

interface CreateOrderDependencies {
  now: () => Date;
  randomId: () => string;
  launchToken: () => string;
}

const defaultDependencies: CreateOrderDependencies = {
  now: () => new Date(),
  randomId: randomUUID,
  launchToken: createLaunchToken,
};

export interface TelegramPremiumOrderPublic {
  id: string;
  planId: PlanId;
  starsAmount: number;
  status: string;
  expiresAt: string;
  paidAt?: string | null;
  failureCode?: string | null;
}

export interface TelegramPremiumOrderCreated extends TelegramPremiumOrderPublic {
  telegramUrl: string;
}

function resultRows(result: unknown): unknown[] {
  if (!Array.isArray(result) || !Array.isArray(result[0])) return [];
  return result[0];
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return new Date(value).toISOString();
}

export async function createTelegramPremiumOrder(
  db: OrderDb,
  input: { userId: string; planId: string; botUsername: string },
  dependencies: Partial<CreateOrderDependencies> = {},
): Promise<TelegramPremiumOrderCreated> {
  const deps = { ...defaultDependencies, ...dependencies };
  const plan = getPlan(input.planId);
  const id = deps.randomId();
  const token = deps.launchToken();
  const tokenHash = hashLaunchToken(token);
  const now = deps.now();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO premium_orders
       (id, user_id, plan, method, amount_usd, stars_amount, currency, status,
        launch_token_hash, launch_expires_at)
       VALUES (?, ?, ?, 'telegram_stars', ?, ?, 'XTR', 'pending', ?, ?)`,
      [
        id,
        input.userId,
        plan.id,
        plan.priceUsd,
        plan.stars,
        tokenHash,
        expiresAt,
      ],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return {
    id,
    planId: plan.id,
    starsAmount: plan.stars,
    status: "pending",
    expiresAt: expiresAt.toISOString(),
    telegramUrl: buildTelegramDeepLink(input.botUsername, token),
  };
}

interface TelegramOrderRow {
  id: string;
  plan: string;
  stars_amount: number;
  status: string;
  launch_expires_at: Date | string;
  paid_at: Date | string | null;
  failure_code: string | null;
}

export async function getTelegramPremiumOrder(
  db: Pick<OrderDb, "execute">,
  userId: string,
  orderId: string,
  now = new Date(),
): Promise<TelegramPremiumOrderPublic | null> {
  const result = await db.execute(
    `SELECT id, plan, stars_amount, status, launch_expires_at, paid_at, failure_code
     FROM premium_orders
     WHERE id = ? AND user_id = ? AND method = 'telegram_stars'
     LIMIT 1`,
    [orderId, userId],
  );
  const row = resultRows(result)[0] as TelegramOrderRow | undefined;
  if (!row) return null;

  const plan = getPlan(row.plan);
  const expiresAt = new Date(row.launch_expires_at);
  const status =
    ["pending", "claimed", "invoice_sent"].includes(row.status) &&
    isLaunchExpired(expiresAt, now)
      ? "expired"
      : row.status;

  return {
    id: row.id,
    planId: plan.id,
    starsAmount: Number(row.stars_amount),
    status,
    expiresAt: expiresAt.toISOString(),
    paidAt: iso(row.paid_at),
    failureCode: row.failure_code,
  };
}
