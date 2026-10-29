import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { getSessionUser } from "@/lib/auth-db";
import { getDbPool } from "@/lib/db-pool";
import { getTelegramPremiumOrder } from "@/lib/telegram-order-store";

export const dynamic = "force-dynamic";

const ORDER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = token ? await getSessionUser(token) : null;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!ORDER_ID_RE.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const db = getDbPool();
  if (!db) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const order = await getTelegramPremiumOrder(db, user.id, id);
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(order, { headers: { "Cache-Control": "no-store" } });
}
