import { ASYNC_REDIS_SCAN_ERROR_CODE } from "../constants.js";
import { AsyncRedisScanErrorCode } from "../types.js";
import { Response } from "../utils/types.js";
import { getErrorMessage } from "../utils/getErrorMessage.js";

/**
 * A minimal interface for the Redis client methods used by {@link asyncRedisScan}.
 * Compatible with the `redis` npm package v4 `RedisClientType`.
 */
export interface RedisClientLike {
    /** Executes a Redis `SCAN` command iteration. */
    scan(cursor: number, options: { MATCH: string; COUNT: number }): Promise<{ cursor: number; keys: string[] }>;
}

/**
 * Parameters for {@link asyncRedisScan}.
 */
export interface AsyncRedisScanParams {
    /** A connected Redis client instance. */
    redisClient: RedisClientLike;
    /** The key pattern to match (e.g. `"bull:myQueue:*"`). */
    keyPattern: string;
    /** How many keys Redis should attempt to return per cursor iteration. */
    count: number;
}

/**
 * Performs a full cursor-based `SCAN` over Redis keys matching `keyPattern`.
 *
 * The scan iterates until the server returns cursor `0`, collecting all
 * matching keys. Uses the `COUNT` hint to control the batch size per
 * round-trip (Redis treats this as a hint, not a hard limit).
 *
 * @param params - {@link AsyncRedisScanParams}
 * @returns A `Response` containing an array of matching key strings on success,
 *   or a typed error on failure.
 *
 * @example
 * const result = await asyncRedisScan({
 *   redisClient,
 *   keyPattern: "bull:myQueue:*",
 *   count: 100,
 * });
 */
export const asyncRedisScan = async (params: AsyncRedisScanParams): Promise<Response<string[], AsyncRedisScanErrorCode>> => {
    const { redisClient, keyPattern, count } = params;

    try {
        const keys: string[] = [];
        let cursor = 0;

        do {
            const result = await redisClient.scan(cursor, { MATCH: keyPattern, COUNT: count });
            cursor = result.cursor;
            keys.push(...result.keys);
        } while (cursor !== 0);

        return { hasFailed: false, data: keys };
    } catch (e) {
        return {
            hasFailed: true,
            error: {
                code: ASYNC_REDIS_SCAN_ERROR_CODE.ERROR_WHILE_SCANNING_REDIS,
                message: getErrorMessage(e),
            },
        };
    }
};
