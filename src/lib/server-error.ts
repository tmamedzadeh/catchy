import { describeError } from "./error-format";
import { renderErrorPage } from "./error-page";

/** Preserve framework responses for client errors; use the app fallback for server failures. */
export function createServerErrorResponse(error: unknown): Response | null {
  const status = getErrorStatus(error);
  if (status !== null && status < 500) return null;

  console.error(describeError(error));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function getErrorStatus(error: unknown): number | null {
  if (error == null || typeof error !== "object") return null;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const status = candidate.statusCode ?? candidate.status;
  return typeof status === "number" && status >= 400 && status <= 599 ? status : null;
}
