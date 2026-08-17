import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth-db";
import { SESSION_COOKIE } from "@/lib/auth";
import {
  getInteractions,
  toggleLike,
  toggleSave,
  toggleFollow,
  mergeLocalState,
} from "@/lib/interactions-db";

export const dynamic = "force-dynamic";

async function requireUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(token);
}

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  const state = await getInteractions(user.id);
  return NextResponse.json({ ok: true, ...state });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const action = String(body.action || "");

  try {
    if (action === "merge") {
      const state = await mergeLocalState(user.id, {
        liked: Array.isArray(body.liked) ? body.liked.map(String) : [],
        saved: Array.isArray(body.saved) ? body.saved.map(String) : [],
        followed: Array.isArray(body.followed) ? body.followed.map(String) : [],
      });
      return NextResponse.json({ ok: true, ...state });
    }

    if (action === "like") {
      const photoId = String(body.photoId || "");
      if (!photoId) return NextResponse.json({ error: "invalid" }, { status: 400 });
      const r = await toggleLike(user.id, photoId);
      return NextResponse.json({ ok: true, on: r.on });
    }

    if (action === "save") {
      const photoId = String(body.photoId || "");
      if (!photoId) return NextResponse.json({ error: "invalid" }, { status: 400 });
      const r = await toggleSave(user.id, photoId);
      return NextResponse.json({ ok: true, on: r.on });
    }

    if (action === "follow") {
      const handle = String(body.handle || "").trim();
      if (!handle) return NextResponse.json({ error: "invalid" }, { status: 400 });
      const r = await toggleFollow(user.id, handle);
      return NextResponse.json({ ok: true, on: r.on });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    if (msg === "creator_not_found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[interactions]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
