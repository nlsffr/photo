import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth-db";
import { SESSION_COOKIE } from "@/lib/auth";

/** Returns the current user (from the session cookie), or {user:null}. */
export async function GET() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return Response.json({ user: null });
  const user = await getSessionUser(token);
  return Response.json({ user });
}
