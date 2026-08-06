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
  startCheckout: () => Promise<void>;
}

const Ctx = createContext<PremiumCtx | null>(null);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === "1") setIsPremium(true);
      // Also honor ?premium=1 for testing
      if (typeof window !== "undefined") {
        const q = new URLSearchParams(window.location.search);
        if (q.get("premium") === "1") {
          setIsPremium(true);
          localStorage.setItem(KEY, "1");
        }
        if (q.get("premium_success") === "1") {
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
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string; demo?: boolean };
      if (data.demo) {
        // Stripe not configured — activate demo premium
        setPremium(true);
        window.location.href = "/premium?premium_success=1";
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      alert(data.error || "Checkout indisponible");
    } catch {
      alert("Erreur réseau");
    }
  }, [setPremium]);

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
