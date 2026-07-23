"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  deriveHandle,
  forgetIdentity,
  importSecret,
  loadOrCreateSecret,
} from "@/lib/anon-identity";

interface AnonCtx {
  ready: boolean;
  /** Public opaque handle (safe to show / send to server). */
  handle: string;
  /** The private secret (never leaves the browser). */
  secret: string;
  regenerate: () => void;
  restore: (secretHex: string) => boolean;
  forget: () => void;
}

const Context = createContext<AnonCtx | null>(null);

export function AnonIdentityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [secret, setSecret] = useState("");
  const [handle, setHandle] = useState("");
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async (s: string) => {
    setSecret(s);
    setHandle(s ? await deriveHandle(s) : "");
  }, []);

  useEffect(() => {
    const s = loadOrCreateSecret();
    refresh(s).finally(() => setReady(true));
  }, [refresh]);

  const regenerate = useCallback(() => {
    forgetIdentity();
    const s = loadOrCreateSecret();
    void refresh(s);
  }, [refresh]);

  const restore = useCallback(
    (secretHex: string) => {
      const ok = importSecret(secretHex);
      if (ok) void refresh(secretHex.trim().toLowerCase());
      return ok;
    },
    [refresh],
  );

  const forget = useCallback(() => {
    forgetIdentity();
    setSecret("");
    setHandle("");
  }, []);

  return (
    <Context.Provider
      value={{ ready, handle, secret, regenerate, restore, forget }}
    >
      {children}
    </Context.Provider>
  );
}

export function useAnonIdentity(): AnonCtx {
  const ctx = useContext(Context);
  if (!ctx)
    throw new Error("useAnonIdentity must be used within AnonIdentityProvider");
  return ctx;
}
