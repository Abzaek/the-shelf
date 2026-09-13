"use client";

import { ApiError } from "@/lib/storage";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "admin";
  quotaBytes: number;
  createdAt: string;
}

export interface Usage {
  usedBytes: number;
  quotaBytes: number;
  totalUsedBytes: number;
  totalQuotaBytes: number;
}

export interface SessionInfo {
  user: SessionUser | null;
  usage: Usage | null;
  registrationOpen: boolean;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? "Request failed.");
  return data as T;
}

export const authClient = {
  session: async (): Promise<SessionInfo> => {
    const res = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return { user: null, usage: null, registrationOpen: true };
    return res.json();
  },
  login: (email: string, password: string) => post<{ user: SessionUser }>("/api/auth/login", { email, password }),
  register: (email: string, password: string, displayName: string) =>
    post<{ user: SessionUser }>("/api/auth/register", { email, password, displayName }),
  logout: () => post<{ ok: true }>("/api/auth/logout"),
  deleteAccount: async (password: string): Promise<void> => {
    const res = await fetch("/api/auth/account", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? "Could not delete the account.");
    }
  },
  usage: async (): Promise<Usage> => {
    const res = await fetch("/api/usage", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) throw new ApiError(res.status, "Could not load usage.");
    return res.json();
  },
};
