"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Thin top bar on route change — instant perceived feedback */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(true);
    const t = window.setTimeout(() => setOn(false), 400);
    return () => window.clearTimeout(t);
  }, [pathname, search]);

  if (!on) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
      aria-hidden
    >
      <div className="h-full w-full origin-left animate-[navload_0.4s_ease-out] bg-[var(--color-accent)]" />
      <style>{`@keyframes navload{0%{transform:scaleX(0)}100%{transform:scaleX(1)}}`}</style>
    </div>
  );
}
