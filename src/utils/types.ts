/**
 * Extracts the union of all value types from an `as const` enum-like object.
 *
 * @example
 * const STATUS = { ACTIVE: "active", PAUSED: "paused" } as const;
 * type Status = EnumType<typeof STATUS>; // "active" | "paused"
 */
export type EnumType<T extends Record<string, string>> = T[keyof T];

/**
 * Represents a typed error with a mandatory code and an optional human-readable message.
 *
 * @typeParam ErrorCode - A string literal type representing the error code.
 */
export type ErrorType<ErrorCode> = {
    /** A machine-readable error code identifying the failure reason. */
    code: ErrorCode;
    /** An optional human-readable description of the error. */
    message?: string;
};

/**
 * A discriminated union representing the outcome of a fallible operation.
 *
 * On success: `{ hasFailed: false; data: Data }`.
 * On failure: `{ hasFailed: true; error: ErrorType<ErrorCode>; retry?: boolean }`.
 *
 * @typeParam Data - The type of the success payload.
 * @typeParam ErrorCode - A string literal union representing possible error codes.
 */
export type Response<Data, ErrorCode extends string> =
    | { hasFailed: false; data: Data }
    | { hasFailed: true; error: ErrorType<ErrorCode>; retry?: boolean };

/**
 * A generic async method signature used as the base constraint for queue method maps.
 */
export type Method = (params?: unknown) => Promise<unknown>;

/**
 * A record of named async methods that can be registered on a `CoalescedQueue`.
 * Each key maps to a `Method` (an async function accepting an optional argument).
 */
export type BaseQueueMethods = Record<string, Method>;

/**
 * Infers the union of all possible parameter types across all methods in a
 * `BaseQueueMethods` map.
 *
 * Useful when you need to accept any valid payload for the queue without
 * knowing which method will be called.
 *
 * @typeParam QueueMethod - A `BaseQueueMethods` map.
 */
export type QueueMethodParams<QueueMethod extends BaseQueueMethods> = {
    [name in keyof QueueMethod]: Parameters<QueueMethod[name]>[0];
}[keyof QueueMethod];
