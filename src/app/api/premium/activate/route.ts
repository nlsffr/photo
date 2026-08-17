import { NextRequest, NextResponse } from "next/server";
import { activatePremium, markOrderPaid } from "@/lib/premium-db";
import type { PlanId } from "@/lib/premium-plans";

export const dynamic = "force-dynamic";

/** Admin activation: ?secret=&userId=&plan=week&orderId= */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || "";
  const expected = process.env.PREMIUM_ADMIN_SECRET || "";
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const userId = req.nextUrl.searchParams.get("userId") || "";
  const plan = (req.nextUrl.searchParams.get("plan") || "week") as PlanId;
  const orderId = req.nextUrl.searchParams.get("orderId") || "";
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  try {
    if (orderId) await markOrderPaid(orderId);
    await activatePremium(userId, plan, "manual", orderId || undefined);
    return NextResponse.json({ ok: true, userId, plan });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
