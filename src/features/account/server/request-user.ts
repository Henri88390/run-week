import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

const authenticatedUser = new AsyncLocalStorage<string>();

export function requestUserId(): string | undefined {
  return authenticatedUser.getStore();
}

/** Only call after validating a mobile session. The identity cannot leak between requests. */
export function withRequestUser<T>(userId: string, handler: () => T): T {
  return authenticatedUser.run(userId, handler);
}
