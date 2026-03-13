import { GET_JOB_COUNT_ERROR_CODE } from "../constants.js";
import { CountJobsProps, GetJobCountErrorCode } from "../types.js";
import { Response } from "../utils/types.js";
import { getErrorMessage } from "../utils/getErrorMessage.js";

/**
 * Counts the total number of jobs in the queue across the specified statuses.
 *
 * Calls `queue.getJobCounts()` with the requested statuses and sums all
 * returned counts into a single integer.
 *
 * @param params - {@link CountJobsProps}
 * @returns A `Response` containing the total job count on success, or a typed
 *   error on failure.
 */
export const countJobs = async ({ bullQueue, statuses }: CountJobsProps): Promise<Response<number, GetJobCountErrorCode>> => {
    try {
        const counts = await bullQueue.getJobCounts(...statuses);
        const totalCount = Object.values(counts).reduce((acc, count) => acc + count, 0);
        return { hasFailed: false, data: totalCount };
    } catch (e) {
        return {
            hasFailed: true,
            error: {
                code: GET_JOB_COUNT_ERROR_CODE.ERROR_WHILE_COUNTING_QUEUE_JOBS,
                message: getErrorMessage(e),
            },
        };
    }
};
