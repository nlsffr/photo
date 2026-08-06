import { NextResponse } from "next/server";

/**
 * User media upload — validates creator exists in DB.
 * Full MinIO/B2 storage can be wired when credentials are ready.
 * For now: accept metadata + reject unknown creators.
 */
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
      return NextResponse.json({ error: "Fichier trop volumineux (max 500 Mo)" }, { status: 400 });
    }

    // Verify creator exists
    const { getProvider } = await import("@/lib/photos");
    const provider = getProvider();
    const found = await provider.getCreator(creator);
    if (!found) {
      return NextResponse.json(
        { error: "Créateur inconnu — choisis un handle existant" },
        { status: 400 },
      );
    }

    // Placeholder: real upload to B2/MinIO + INSERT photos comes next
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
