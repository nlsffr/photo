import { LocalizedPage, localizedPageMetadata } from "@/features/i18n/LocalizedPage";

type Props = {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pathnameFrom(parts?: string[]): string {
  return parts?.length ? `/${parts.join("/")}` : "/";
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { path } = await params;
  return localizedPageMetadata("fr", pathnameFrom(path), searchParams);
}

export default async function FrenchPage({ params, searchParams }: Props) {
  const { path } = await params;
  return <LocalizedPage locale="fr" pathname={pathnameFrom(path)} searchParams={searchParams} />;
}
