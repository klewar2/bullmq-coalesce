/**
 * Extracts a human-readable error message from an unknown thrown value.
 *
 * @param error - The value caught in a catch block (unknown type).
 * @returns A string describing the error. Falls back to a generic message when
 *   the value is neither an `Error` instance nor a plain string.
 *
 * @example
 * try {
 *   throw new Error("Something went wrong");
 * } catch (e) {
 *   console.log(getErrorMessage(e)); // "Something went wrong"
 * }
 */
export const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "An unknown error occurred";
};
