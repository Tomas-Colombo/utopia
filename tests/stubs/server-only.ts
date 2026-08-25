/**
 * Stand-in for the `server-only` package under Vitest.
 *
 * `server-only` is not a real dependency here — Next.js resolves it during its
 * own build, where importing it from a Client Component is a build error. That
 * guard is exactly what the DAL wants in production and exactly what cannot
 * work under Vitest, which has no such build step and no installed package to
 * resolve.
 *
 * Aliased in `vitest.config.mts`. Without it, coverage instrumentation of any
 * DAL module that imports `server-only` dies on an unresolved import, and the
 * module drops out of the report — silently, which is the worst way for a
 * coverage number to be wrong.
 */
export {}
