import { Job } from "bullmq";
import { RETURN_VALUE_REASON_CODE } from "../constants.js";
import { DelayedJobData, InternalQueueState, ReturnValueErrorCode } from "../types.js";
import { BaseQueueMethods, Response } from "../utils/types.js";
import { isDelayedJobType } from "../helpers.js";

/**
 * Parameters for {@link handleJob}.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export interface HandleJobParams<QueueMethods extends BaseQueueMethods> {
    /** The BullMQ job to execute. */
    job: Job;
    /** The internal queue state providing method handlers. */
    internalQueue: InternalQueueState<QueueMethods>;
    /**
     * Optional async guard invoked before the method is called.
     * Return `{ hasFailed: true, retry: true }` to re-queue, or
     * `{ hasFailed: true, retry: false }` to drop the job.
     */
    onBeforeExecuteJob?: (job: Job<DelayedJobData<QueueMethods>>) => Promise<Response<undefined, ReturnValueErrorCode>>;
    /**
     * Optional callback invoked immediately after the method returns
     * successfully.
     */
    onExecuteJob?: (job: Job<DelayedJobData<QueueMethods>>) => void;
}

/**
 * Executes the method registered for a BullMQ job's `method` field.
 *
 * Validates that the job data matches the {@link DelayedJobData} shape before
 * dispatching. If `onBeforeExecuteJob` is provided and returns a failure
 * response, execution is aborted and that response is forwarded.
 *
 * @param params - {@link HandleJobParams}
 * @returns A `Response<undefined, ReturnValueErrorCode>` indicating whether the
 *   job executed successfully.
 * @throws When the job data does not match the expected shape (non-delayed job).
 */
export const handleJob = async <QueueMethods extends BaseQueueMethods>(
    params: HandleJobParams<QueueMethods>,
): Promise<Response<undefined, ReturnValueErrorCode>> => {
    const { job, internalQueue, onBeforeExecuteJob, onExecuteJob } = params;

    if (!isDelayedJobType<QueueMethods>(job, internalQueue.methods)) {
        throw new Error(`Not a coalesced job: ${job.name}`);
    }

    const {
        data: { method, params: methodParams },
    } = job;

    if (onBeforeExecuteJob) {
        const beforeResponse = await onBeforeExecuteJob(job);
        if (beforeResponse.hasFailed) return beforeResponse;
    }

    // The method key is validated by isDelayedJobType above.
    await (internalQueue.methods[method as string] as (p: unknown) => Promise<unknown>)(methodParams);

    onExecuteJob?.(job);

    return { hasFailed: false, data: undefined };
};
