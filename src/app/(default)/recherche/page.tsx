import type { Metadata } from "next";
import SearchPage from "@/features/search/SearchPage";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
};

export default function SearchRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <SearchPage searchParams={searchParams} />;
}
