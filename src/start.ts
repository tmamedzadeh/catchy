import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { createServerErrorResponse } from "./lib/server-error";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    const response = createServerErrorResponse(error);
    if (response) return response;
    throw error;
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
