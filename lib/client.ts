"use client";

import type { ApiResponse, Role, SafeUser } from "@/types";

/**
 * Browser-side API client.
 *
 * The spec pins the storage keys: the JWT lives in `rf_token` and the safe user
 * object in `rf_user`. The token is mirrored into a same-site cookie so that
 * Server Components can authenticate the same session.
 */

export const TOKEN_KEY = "rf_token";
export const USER_KEY = "rf_user";

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): SafeUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SafeUser;
  } catch {
    // A corrupted entry should not wedge the app.
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function storeSession(token: string, user: SafeUser): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

export function storeUser(user: SafeUser): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  document.cookie = `${TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Thrown for any non-2xx response, carrying field errors for forms. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Set for FormData uploads, where the browser must pick the boundary. */
  formData?: FormData;
  signal?: AbortSignal;
}

/**
 * Calls the API and unwraps the `{ success, data }` envelope, so callers deal
 * in domain data and exceptions rather than response plumbing.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, formData, signal } = options;
  const token = getToken();

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(path, {
    method,
    headers,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    signal,
  });

  let payload: ApiResponse<T> | undefined;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = undefined;
  }

  if (!response.ok || !payload || payload.success === false) {
    const message =
      payload && payload.success === false
        ? payload.message
        : `Request failed (${response.status})`;
    const errors = payload && payload.success === false ? payload.errors : undefined;

    // An expired or revoked session should not leave stale data behind.
    if (response.status === 401) clearSession();

    throw new ApiError(response.status, message, errors);
  }

  return payload.data;
}

/** Where each role lands after signing in. */
export function dashboardPathFor(role: Role): string {
  switch (role) {
    case "admin":
      return "/dashboard/admin";
    case "landlord":
      return "/dashboard/landlord";
    default:
      return "/dashboard/tenant";
  }
}

/** Builds a query string, dropping empty values so URLs stay clean. */
export function buildQuery(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
