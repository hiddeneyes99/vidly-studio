import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getToken, login as doLogin, logout as doLogout, verifyToken } from "@/lib/auth";

type AuthState = {
  isAuthed: boolean;
  isReady: boolean;
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!getToken()) {
        if (alive) setIsReady(true);
        return;
      }
      const ok = await verifyToken();
      if (!alive) return;
      setIsAuthed(ok);
      setIsReady(true);
    })();

    const onExpired = () => {
      setIsAuthed(false);
      setUsername(null);
    };
    window.addEventListener("auth:expired", onExpired);

    return () => {
      alive = false;
      window.removeEventListener("auth:expired", onExpired);
    };
  }, []);

  const value: AuthState = {
    isAuthed,
    isReady,
    username,
    async login(u: string, p: string) {
      const res = await doLogin(u, p);
      setIsAuthed(true);
      setUsername(res.user.username);
    },
    async logout() {
      await doLogout();
      setIsAuthed(false);
      setUsername(null);
    },
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
