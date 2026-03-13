import { GET_JOB_NAMES_ERROR_CODE } from "../constants.js";
import { GetFailedJobsProps, GetJobNamesErrorCode } from "../types.js";
import { BaseQueueMethods, Response } from "../utils/types.js";
import { getErrorMessage } from "../utils/getErrorMessage.js";

/**
 * Retrieves the names of all failed jobs in the queue.
 *
 * Returns an empty array when there are no failed jobs, avoiding an
 * unnecessary call to `queue.getFailed()`.
 *
 * @param params - {@link GetFailedJobsProps}
 * @returns A `Response` containing an array of failed job name strings on
 *   success, or a typed error on failure.
 */
export const getFailedJobs = async <QueueMethods extends BaseQueueMethods>(
    params: GetFailedJobsProps<QueueMethods>,
): Promise<Response<string[], GetJobNamesErrorCode>> => {
    const { internalQueue } = params;

    try {
        const failedCount = await internalQueue.queue.getFailedCount();
        if (failedCount === 0) {
            return { hasFailed: false, data: [] };
        }

        const jobs = await internalQueue.queue.getFailed();
        return { hasFailed: false, data: jobs.map((job) => job.name) };
    } catch (e) {
        return {
            hasFailed: true,
            error: {
                code: GET_JOB_NAMES_ERROR_CODE.ERROR_WHILE_GETTING_JOBS,
                message: getErrorMessage(e),
            },
        };
    }
};
