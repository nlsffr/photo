import { LocalizedPage, localizedPageMetadata } from "@/features/i18n/LocalizedPage";

type Props = {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pathnameFrom(parts?: string[]): string {
  return parts?.length ? `/${parts.join("/")}` : "/";
}

export async function generateMetadata({ params }: Props) {
  const { path } = await params;
  return localizedPageMetadata("en", pathnameFrom(path));
}

export default async function EnglishPage({ params, searchParams }: Props) {
  const { path } = await params;
  return <LocalizedPage locale="en" pathname={pathnameFrom(path)} searchParams={searchParams} />;
}
