const TOKEN_KEY = "creator_os_token";
const EXPIRY_KEY = "creator_os_token_expiry";

export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) || "/api";

export type LoginResponse = {
  token: string;
  expiresInDays: number;
  user: { username: string };
};

export function getToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(EXPIRY_KEY);
  if (!token || !expiry) return null;
  if (Date.now() > Number(expiry)) {
    clearToken();
    return null;
  }
  return token;
}

export function setToken(token: string, expiresInDays: number): void {
  const expiry = Date.now() + expiresInDays * 24 * 60 * 60 * 1000;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRY_KEY, String(expiry));
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    let msg = "Login failed";
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  const data = (await res.json()) as LoginResponse;
  setToken(data.token, data.expiresInDays);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { ...authHeaders() },
    });
  } catch {}
  clearToken();
}

export async function verifyToken(): Promise<boolean> {
  if (!getToken()) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { ...authHeaders() },
    });
    if (!res.ok) {
      clearToken();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * fetch wrapper that automatically attaches the Authorization header
 * and clears the token on a 401 response.
 */
export async function authFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
  }
  return res;
}
