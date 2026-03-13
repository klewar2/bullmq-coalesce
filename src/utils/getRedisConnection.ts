import { RedisOptions } from "bullmq";

/**
 * Parses a Redis connection URL and returns a BullMQ-compatible `RedisOptions` object.
 *
 * Supports both `redis://` (plain) and `rediss://` (TLS) URL schemes.
 * The database index is inferred from the URL pathname (e.g. `/2` → db `2`).
 *
 * @param url - A full Redis connection URL, e.g. `redis://user:pass@localhost:6379/0`
 *   or `rediss://user:pass@my-host.example.com:6380/1`.
 * @returns A `RedisOptions` object that can be passed directly to BullMQ `Queue` or `Worker`.
 *
 * @example
 * const options = getRedisConnectionFromUrl("redis://:secret@127.0.0.1:6379/0");
 * // { host: "127.0.0.1", port: 6379, password: "secret", db: 0 }
 */
export const getRedisConnectionFromUrl = (url: string): RedisOptions => {
    const parsed = new URL(url);

    const host = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port, 10) : 6379;
    const password = parsed.password || undefined;
    const username = parsed.username || undefined;

    // pathname is "/db" — strip the leading slash and parse as integer
    const dbString = parsed.pathname.replace(/^\//, "");
    const db = dbString ? parseInt(dbString, 10) : undefined;

    const tls = parsed.protocol === "rediss:" ? {} : undefined;

    return {
        host,
        port,
        ...(password !== undefined && { password }),
        ...(username !== undefined && { username }),
        ...(db !== undefined && { db }),
        ...(tls !== undefined && { tls }),
    };
};
