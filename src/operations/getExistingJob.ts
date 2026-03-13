import { Job } from "bullmq";
import { GET_JOB_ERROR_CODE } from "../constants.js";
import { DelayedJobData, GetJobErrorCode, InternalQueueState } from "../types.js";
import { BaseQueueMethods, Response } from "../utils/types.js";
import { getErrorMessage } from "../utils/getErrorMessage.js";

/**
 * Parameters for {@link getExistingJob}.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export interface GetExistingJobParams<QueueMethods extends BaseQueueMethods> {
    /** The internal queue state containing the BullMQ Queue instance. */
    internalQueue: InternalQueueState<QueueMethods>;
    /** The job name (used as the BullMQ job ID). */
    name: string;
}

/**
 * Retrieves an existing BullMQ job by name from the queue.
 *
 * Returns `undefined` in the success case when no job with the given name
 * exists, rather than failing.
 *
 * @param params - {@link GetExistingJobParams}
 * @returns A `Response` containing the `Job` (or `undefined`) on success, or
 *   a typed error on failure.
 */
export const getExistingJob = async <QueueMethods extends BaseQueueMethods>(
    params: GetExistingJobParams<QueueMethods>,
): Promise<Response<Job<DelayedJobData<QueueMethods>> | undefined, GetJobErrorCode>> => {
    const { internalQueue, name } = params;
    try {
        const job = await internalQueue.queue.getJob(name);
        return {
            hasFailed: false,
            data: job as Job<DelayedJobData<QueueMethods>> | undefined,
        };
    } catch (e) {
        return {
            hasFailed: true,
            error: {
                code: GET_JOB_ERROR_CODE.ERROR_WHILE_GETTING_QUEUE_JOBS,
                message: getErrorMessage(e),
            },
        };
    }
};
