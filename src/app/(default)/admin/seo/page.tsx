import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth";
import { getSessionUser } from "@/lib/auth-db";
import { isSeoEditorId } from "@/lib/seo-editor-access";
import { SeoEditor } from "@/components/SeoEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Éditeur des titres et descriptions",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SeoEditorPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = token ? await getSessionUser(token) : null;
  if (!user) redirect("/connexion?next=%2Fadmin%2Fseo");
  if (!isSeoEditorId(user.id)) notFound();
  return <SeoEditor />;
}
