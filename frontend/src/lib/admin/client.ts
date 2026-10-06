import createClient from "openapi-fetch";

import { ApiError, type Problem } from "@/lib/api/errors";
import type { paths } from "@/lib/api/schema";
import { adminSession, refreshAdminToken } from "./session";

const AUTH_PREFIX = "/api/v1/admin/auth/";

function withAuth(request: Request): Request {
  const token = adminSession.getToken();
  if (token) request.headers.set("Authorization", `Bearer ${token}`);
  return request;
}

/**
 * fetch wrapper for the admin console: attaches the in-memory admin bearer
 * token and, on a 401, refreshes once (single-flight) and retries.
 */
export async function adminFetch(input: Request): Promise<Response> {
  const isAuthCall = new URL(input.url, "http://local").pathname.startsWith(AUTH_PREFIX);
  const retry = isAuthCall ? null : input.clone();
  const sentWith = adminSession.getToken();
  const response = await fetch(withAuth(input));
  if (response.status !== 401 || !retry) return response;
  const current = adminSession.getToken();
  if (!current || current === sentWith) {
    const refreshed = await refreshAdminToken();
    if (!refreshed.ok) return response;
  }
  return fetch(withAuth(retry));
}

export const adminApi = createClient<paths>({
  baseUrl: "",
  credentials: "include",
  fetch: adminFetch,
});

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Await an openapi-fetch call and return its data, or throw an ApiError. */
export async function unwrap<T>(call: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await call;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0);
  }
  if (result.response.ok) return result.data as T;
  const problem: Problem =
    result.error && typeof result.error === "object"
      ? (result.error as Problem)
      : { detail: typeof result.error === "string" && result.error.length < 300 ? result.error : undefined };
  throw new ApiError(result.response.status, problem);
}

/** Download a file from an admin endpoint with the bearer token (e.g. CSV export). */
export async function adminDownload(path: string, fallbackName: string): Promise<void> {
  const response = await adminFetch(new Request(path, { method: "GET", credentials: "include" }));
  if (!response.ok) {
    let problem: Problem = {};
    try {
      problem = (await response.json()) as Problem;
    } catch {
      // not JSON
    }
    throw new ApiError(response.status, problem);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
