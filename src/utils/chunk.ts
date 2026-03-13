/**
 * Splits an array into chunks of the given size.
 *
 * @param array - The array to split.
 * @param size - The maximum number of elements per chunk.
 * @returns An array of chunks.
 *
 * @example
 * chunk([1, 2, 3, 4, 5], 2) // [[1, 2], [3, 4], [5]]
 */
export function chunk<T>(array: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}
