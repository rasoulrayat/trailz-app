// workerd provides node:async_hooks with the nodejs_compat flag (wrangler.jsonc); the worker types don't declare it.
declare module "node:async_hooks" {
  export class AsyncLocalStorage<T> {
    getStore(): T | undefined;
    run<R>(store: T, fn: () => R): R;
  }
}
