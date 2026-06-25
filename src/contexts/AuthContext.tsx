import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchMe, logout as apiLogout } from "../lib/api";
import {
  clearSession,
  getSessionToken,
  getStoredUser,
  setSession,
  type AuthUser,
} from "../lib/auth";
import { syncPendingOps } from "../lib/sync";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (token: string, authUser: AuthUser) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const token = getSessionToken();
    return token ? getStoredUser() : null;
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = getSessionToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
    }

    try {
      const { user: me } = await fetchMe();
      if (!me.email) throw new Error("Sin email");
      const authUser = { id: me.id, email: me.email };
      setSession(token, authUser);
      setUser(authUser);
      await syncPendingOps();
    } catch {
      if (!getSessionToken()) {
        clearSession();
        setUser(null);
      } else if (stored) {
        setUser(stored);
      } else {
        clearSession();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback((token: string, authUser: AuthUser) => {
    setSession(token, authUser);
    setUser(authUser);
    setLoading(false);
    void syncPendingOps();
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
}
