"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const KEY = "lfh:premium:v1";

interface PremiumCtx {
  isPremium: boolean;
  ready: boolean;
  setPremium: (v: boolean) => void;
  /** @deprecated Stripe removed — kept as no-op for old callers */
  startCheckout: () => Promise<void>;
}

const Ctx = createContext<PremiumCtx | null>(null);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") setIsPremium(true);
      if (typeof window !== "undefined") {
        const q = new URLSearchParams(window.location.search);
        if (q.get("premium_success") === "1" || q.get("premium") === "1") {
          setIsPremium(true);
          localStorage.setItem(KEY, "1");
        }
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const setPremium = useCallback((v: boolean) => {
    setIsPremium(v);
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const startCheckout = useCallback(async () => {
    window.location.href = "/premium";
  }, []);

  return (
    <Ctx.Provider value={{ isPremium, ready, setPremium, startCheckout }}>
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
      startCheckout: async () => {},
    };
  }
  return ctx;
}
