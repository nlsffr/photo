"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface SessionUser {
  id: string;
  email: string;
  username: string | null;
  isCreator: boolean;
}

interface SessionContextValue {
  user: SessionUser | null;
  loading: boolean;
  /** Refresh from /api/auth/me (call after login/register/logout). */
  refresh: () => Promise<void>;
  setUser: (u: SessionUser | null) => void;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const json = (await res.json()) as { user: SessionUser | null };
      setUser(json.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — we clear locally regardless
    }
    setUser(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ user, loading, refresh, setUser, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    // Safe fallback so components don't crash if the provider isn't mounted.
    return {
      user: null,
      loading: false,
      refresh: async () => {},
      setUser: () => {},
      logout: async () => {},
    };
  }
  return ctx;
}
