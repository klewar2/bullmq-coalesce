/**
 * Determines whether a given value is a plain object (non-null, typeof "object").
 *
 * This is a type guard that narrows the type to `Record<string, unknown>`,
 * making it safe to access named properties on the value.
 *
 * @param value - The value to test.
 * @returns `true` when `value` is a non-null object, `false` otherwise.
 *
 * @example
 * isObject({});        // true
 * isObject(null);      // false
 * isObject("string");  // false
 * isObject([]);        // true  (arrays are objects)
 */
export const isObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null;
};
