import { NextResponse } from "next/server";
import { getCreator } from "@/lib/photos";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const creator = String(form.get("creator") || "").trim().toLowerCase();
    const title = String(form.get("title") || "").trim();

    if (!creator) {
      return NextResponse.json({ error: "Créateur requis" }, { status: 400 });
    }
    if (!(file instanceof File) || file.size < 1) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }
    if (file.size > 500 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Fichier trop volumineux (max 500 Mo)" },
        { status: 400 },
      );
    }

    const found = await getCreator(creator);
    if (!found) {
      return NextResponse.json(
        { error: "Créateur inconnu — choisis un handle existant" },
        { status: 400 },
      );
    }

    console.info("[upload]", {
      creator,
      title,
      name: file.name,
      size: file.size,
      type: file.type,
    });

    return NextResponse.json({
      ok: true,
      pending: true,
      message: "Reçu — publication après traitement",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "upload_failed" },
      { status: 500 },
    );
  }
}
