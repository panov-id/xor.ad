// Thin fetch client for the relay control-plane. Carries the panel session JWT
// (stored in localStorage) as a Bearer token on every request.
import { API_URL } from "./constants";

const TOKEN_KEY = "panel_jwt";

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return await fetch(`${API_URL}${path}`, { ...init, headers });
}
