import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth-db";
import { SESSION_COOKIE } from "@/lib/auth";
import { isUserPremium } from "@/lib/premium-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ isPremium: false, user: null });
  const user = await getSessionUser(token);
  if (!user) return NextResponse.json({ isPremium: false, user: null });
  const isPremium = await isUserPremium(user.id);
  return NextResponse.json({ isPremium, user: { id: user.id, email: user.email } });
}
