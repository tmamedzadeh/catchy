import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError } from "./error-format";
import { createServerErrorResponse } from "./server-error";

afterEach(() => vi.restoreAllMocks());

describe("server error reporting", () => {
  it("keeps the original stack, status, and nested cause detail", () => {
    const cause = new Error("database unavailable");
    const error = new Error("request failed", { cause }) as Error & { statusCode: number };
    error.statusCode = 503;
    const description = describeError(error);
    expect(description).toContain("request failed");
    expect(description).toContain("database unavailable");
    expect(description).toContain("caused by:");
    expect(description).toContain("(status 503)");
  });

  it("renders a friendly 500 response and logs the detailed error", async () => {
    const error = new Error("unexpected render failure");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = createServerErrorResponse(error);
    expect(response?.status).toBe(500);
    expect(response?.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response?.text()).toContain("This page didn't load");
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain("unexpected render failure");
  });

  it("leaves expected client errors for TanStack and H3 to handle", () => {
    expect(createServerErrorResponse({ status: 404, message: "Not found" })).toBeNull();
    expect(createServerErrorResponse({ statusCode: 429, message: "Too many requests" })).toBeNull();
  });
});
