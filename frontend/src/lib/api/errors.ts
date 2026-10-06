/** RFC 9457 problem+json as emitted by the MailSentinel API. */
export interface ProblemFieldError {
  loc: (string | number)[];
  msg: string;
}

export interface Problem {
  type?: string;
  title?: string;
  status?: number;
  code?: string;
  detail?: string;
  errors?: ProblemFieldError[];
  retry_after?: number;
  [key: string]: unknown;
}

const FALLBACK: Record<number, string> = {
  0: "Can't reach MailSentinel. Check your connection and try again.",
  400: "That request couldn't be processed.",
  401: "Your session has expired. Please sign in again.",
  403: "You don't have permission to do that.",
  404: "We couldn't find that.",
  409: "That conflicts with something that already exists.",
  422: "Some fields need attention.",
  429: "Too many attempts. Please wait a moment and try again.",
  500: "Something went wrong on our side. Please try again.",
  502: "An upstream service didn't respond. Please try again.",
  503: "MailSentinel is temporarily unavailable.",
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly errors: ProblemFieldError[];
  readonly retryAfter?: number;

  constructor(status: number, problem: Problem = {}) {
    const detail =
      (typeof problem.detail === "string" && problem.detail) ||
      FALLBACK[status] ||
      (status >= 500 ? FALLBACK[500] : FALLBACK[400]);
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.code = problem.code ?? (status === 0 ? "network_error" : "http_error");
    this.detail = detail;
    this.errors = Array.isArray(problem.errors) ? problem.errors : [];
    this.retryAfter =
      typeof problem.retry_after === "number" ? problem.retry_after : undefined;
  }

  /** Field errors with the leading "body" segment stripped, e.g. `name` or `condition.all.0.value`. */
  fieldErrors(): { path: string; message: string }[] {
    return this.errors.map((e) => {
      const loc = e.loc[0] === "body" ? e.loc.slice(1) : e.loc;
      return { path: loc.join("."), message: cleanMessage(e.msg) };
    });
  }
}

function cleanMessage(msg: string) {
  return msg.replace(/^Value error, /, "");
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof DOMException && err.name === "AbortError") {
    return new ApiError(0, { code: "aborted", detail: "Request was cancelled." });
  }
  return new ApiError(0);
}

/** Human-friendly message for any thrown value. */
export function errorMessage(err: unknown): string {
  const e = toApiError(err);
  if (e.status === 422 && e.errors.length > 0) {
    const first = e.fieldErrors()[0];
    return first.path ? `${first.path}: ${first.message}` : first.message;
  }
  return e.detail;
}
