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
  return localizedPageMetadata("es", pathnameFrom(path), searchParams);
}

export default async function LocalizedDiscoveryPage({ params, searchParams }: Props) {
  const { path } = await params;
  return <LocalizedPage locale="es" pathname={pathnameFrom(path)} searchParams={searchParams} />;
}
