"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useSession } from "./Session";

interface PremiumCtx {
  isPremium: boolean;
  ready: boolean;
  setPremium: (v: boolean) => void;
  refresh: () => Promise<void>;
  startCheckout: () => Promise<void>;
}

const Ctx = createContext<PremiumCtx | null>(null);
type Entitlement = { userId: string | null; isPremium: boolean; ready: boolean };

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading: sessionLoading } = useSession();
  const userId = user?.id ?? null;
  const [entitlement, setEntitlement] = useState<Entitlement>({ userId: null, isPremium: false, ready: false });
  const requestNumber = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const abortPending = useCallback(() => {
    ++requestNumber.current;
    controller.current?.abort();
  }, []);

  const refresh = useCallback(async () => {
    const request = ++requestNumber.current;
    controller.current?.abort();
    if (sessionLoading) return;
    if (!userId) {
      setEntitlement({ userId: null, isPremium: false, ready: true });
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    try {
      const res = await fetch("/api/premium/status", { cache: "no-store", signal: abort.signal });
      if (!res.ok) throw new Error("premium_status_unavailable");
      const data = await res.json();
      if (request !== requestNumber.current || abort.signal.aborted) return;
      if (typeof data?.isPremium !== "boolean" || data?.user?.id !== userId) throw new Error("premium_status_invalid");
      setEntitlement({ userId, isPremium: data.isPremium, ready: true });
    } catch {
      if (request !== requestNumber.current) return;
      // A failed read is neither proof of expiry nor permission to show ads.
      setEntitlement(previous => ({ userId, isPremium: previous.userId === userId && previous.isPremium, ready: false }));
    }
  }, [userId, sessionLoading]);

  useEffect(() => {
    if (sessionLoading) return;
    void refresh();
    const recheck = () => { if (document.visibilityState !== "hidden") void refresh(); };
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      abortPending();
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [sessionLoading, refresh, abortPending]);

  const setPremium = useCallback((v: boolean) => {
    abortPending();
    setEntitlement({ userId, isPremium: Boolean(userId) && v, ready: !sessionLoading });
  }, [userId, sessionLoading, abortPending]);

  const startCheckout = useCallback(async () => {
    router.push("/premium");
  }, [router]);
  const sameUser = entitlement.userId === userId;
  const isPremium = sameUser && entitlement.isPremium;
  const ready = !sessionLoading && sameUser && entitlement.ready;

  return (
    <Ctx.Provider value={{ isPremium, ready, setPremium, refresh, startCheckout }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePremium(): PremiumCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      isPremium: false,
      ready: false,
      setPremium: () => {},
      refresh: async () => {},
      startCheckout: async () => {},
    };
  }
  return ctx;
}
