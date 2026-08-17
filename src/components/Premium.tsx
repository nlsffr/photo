"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSession } from "./Session";

interface PremiumCtx {
  isPremium: boolean;
  ready: boolean;
  setPremium: (v: boolean) => void;
  refresh: () => Promise<void>;
  startCheckout: () => Promise<void>;
}

const Ctx = createContext<PremiumCtx | null>(null);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: sessionLoading } = useSession();
  const [isPremium, setIsPremium] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setIsPremium(false);
      setReady(true);
      return;
    }
    try {
      const res = await fetch("/api/premium/status", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        setIsPremium(Boolean(j.isPremium));
      } else {
        setIsPremium(false);
      }
    } catch {
      setIsPremium(false);
    } finally {
      setReady(true);
    }
  }, [user]);

  useEffect(() => {
    if (sessionLoading) return;
    setReady(false);
    void refresh();
  }, [user, sessionLoading, refresh]);

  const setPremium = useCallback((v: boolean) => {
    setIsPremium(v);
  }, []);

  const startCheckout = useCallback(async () => {
    window.location.href = "/premium";
  }, []);

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
      ready: true,
      setPremium: () => {},
      refresh: async () => {},
      startCheckout: async () => {},
    };
  }
  return ctx;
}
