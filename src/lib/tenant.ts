import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped storage tenant. Every object key is namespaced under
 * `users/{uid}/`, so one user can never read or write another user's objects.
 *
 * `getSession()` binds the tenant for the rest of the request. Outside a
 * request (scripts, health checks) the prefix falls back to `shared`.
 */
const tenant = new AsyncLocalStorage<string>();

export function setTenant(uid: string): void {
  tenant.enterWith(uid);
}

export function currentUid(): string | null {
  return tenant.getStore() ?? null;
}

export function tenantPrefix(): string {
  return `users/${tenant.getStore() ?? "shared"}/`;
}
