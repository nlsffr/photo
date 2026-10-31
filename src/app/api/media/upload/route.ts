import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "upload_unavailable" }, { status: 503 });
}
