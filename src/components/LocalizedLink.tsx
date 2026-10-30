"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { localizedHref } from "@/lib/i18n/config";
import { useLocale } from "@/components/LocaleProvider";

type LocalizedLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
};

/** Prefixes translated first-party pages while leaving detail and external URLs alone. */
export function LocalizedLink({ href, ...props }: LocalizedLinkProps) {
  const { locale } = useLocale();
  const destination = localizedHref(locale, href);
  return <Link href={destination} {...props} />;
}
