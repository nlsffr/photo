import { NextResponse } from "next/server";
import { searchCreators } from "@/lib/photos";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) {
    return NextResponse.json({ items: [] });
  }
  try {
    const items = await searchCreators(q, 14);
    return NextResponse.json({
      items: items.map((c) => ({
        handle: c.handle,
        name: c.name,
        avatarUrl: c.avatarUrl,
        followers: c.followers,
      })),
    });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
