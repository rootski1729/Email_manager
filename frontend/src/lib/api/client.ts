import createClient from "openapi-fetch";

import { refreshAccessToken, session } from "@/lib/auth/session";
import { ApiError, type Problem } from "./errors";
import type { paths } from "./schema";

const AUTH_PREFIX = "/api/v1/auth/";

function withAuth(request: Request): Request {
  const token = session.getToken();
  if (token) request.headers.set("Authorization", `Bearer ${token}`);
  return request;
}

/**
 * fetch wrapper: attaches the in-memory bearer token and, on a 401, refreshes
 * once (single-flight) and retries the original request.
 */
async function authFetch(input: Request): Promise<Response> {
  const isAuthCall = new URL(input.url, "http://local").pathname.startsWith(AUTH_PREFIX);
  const retry = isAuthCall ? null : input.clone();
  const sentWith = session.getToken();
  const response = await fetch(withAuth(input));
  if (response.status !== 401 || !retry) return response;
  // Another request may already have refreshed the token while this one was in flight.
  const current = session.getToken();
  if (!current || current === sentWith) {
    const refreshed = await refreshAccessToken();
    if (!refreshed.ok) return response;
  }
  return fetch(withAuth(retry));
}

export const api = createClient<paths>({
  baseUrl: "",
  credentials: "include",
  fetch: authFetch,
});

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Await an openapi-fetch call and either return its data or throw an ApiError. */
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
