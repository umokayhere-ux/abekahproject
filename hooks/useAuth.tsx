"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  apiFetch,
  clearSession,
  dashboardPathFor,
  getStoredUser,
  getToken,
  storeSession,
  storeUser,
} from "@/lib/client";
import type { Role, SafeUser } from "@/types";

interface AuthState {
  user: SafeUser | null;
  /** True until the stored session has been reconciled with the server. */
  loading: boolean;
  login: (email: string, password: string) => Promise<SafeUser>;
  register: (input: RegisterInput) => Promise<SafeUser>;
  logout: () => Promise<void>;
  /** Replaces the cached user, e.g. after a profile update. */
  setUser: (user: SafeUser) => void;
  /** Re-reads the user from the server. */
  refresh: () => Promise<SafeUser | null>;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: Extract<Role, "tenant" | "landlord">;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Seeded synchronously from localStorage so a signed-in user does not see a
  // flash of the signed-out UI on navigation.
  const [user, setUserState] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    // Deferred to a timer so no state is written synchronously during the
    // effect, which would cascade an extra render before the first paint.
    const timer = setTimeout(() => {
      const stored = getStoredUser();
      if (stored) setUserState(stored);

      if (!getToken()) {
        setLoading(false);
        return;
      }

      // Reconcile with the server: the cached copy may be stale (role changed,
      // account suspended or deleted, token expired).
      apiFetch<{ user: SafeUser }>("/api/auth/me")
        .then(({ user: fresh }) => {
          if (cancelled) return;
          setUserState(fresh);
          storeUser(fresh);
        })
        .catch(() => {
          if (cancelled) return;
          clearSession();
          setUserState(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ user: SafeUser; token: string }>(
      "/api/auth/login",
      { method: "POST", body: { email, password } },
    );
    storeSession(data.token, data.user);
    setUserState(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const data = await apiFetch<{ user: SafeUser; token: string }>(
      "/api/auth/register",
      { method: "POST", body: input },
    );
    storeSession(data.token, data.user);
    setUserState(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    // Best-effort audit entry; sign-out proceeds regardless.
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    clearSession();
    setUserState(null);
    router.push("/auth/login");
  }, [router]);

  const setUser = useCallback((next: SafeUser) => {
    setUserState(next);
    storeUser(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) return null;
    try {
      const { user: fresh } = await apiFetch<{ user: SafeUser }>("/api/auth/me");
      setUserState(fresh);
      storeUser(fresh);
      return fresh;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout, setUser, refresh }),
    [user, loading, login, register, logout, setUser, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return context;
}

/**
 * Guards a dashboard subtree. Unauthenticated visitors go to the login page;
 * a user who lands on another role's dashboard is redirected to their own.
 */
export function useRequireRole(role: Role): {
  user: SafeUser | null;
  ready: boolean;
} {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (user.role !== role) {
      router.replace(dashboardPathFor(user.role));
    }
  }, [user, loading, role, router]);

  return { user, ready: !loading && user?.role === role };
}

export { dashboardPathFor };
