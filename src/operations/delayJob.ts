import { Job } from "bullmq";
import { SET_JOB_ERROR_CODE } from "../constants.js";
import { DelayedJobData, DelayedMethodsAndDataType, SetJobErrorCode } from "../types.js";
import { BaseQueueMethods, Response } from "../utils/types.js";
import { getErrorMessage } from "../utils/getErrorMessage.js";

/**
 * Parameters for the {@link delayJob} operation.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export interface DelayJobParams<QueueMethods extends BaseQueueMethods> {
    /** The existing BullMQ job whose delay should be reset. */
    job: Job<DelayedJobData<QueueMethods>>;
    /** Updated method/params payload to store on the job. */
    newPayload: DelayedMethodsAndDataType<QueueMethods>;
    /**
     * When set, the job is promoted to run immediately once `countDelayed`
     * reaches this threshold, rather than being delayed again.
     */
    maxCountDelayed?: number;
    /**
     * Optional callback invoked after the job has been successfully delayed
     * (or promoted).
     */
    onDelayedJob?: (job: Job<DelayedJobData<QueueMethods>>) => void;
    /** The new delay to apply, in seconds. */
    newDelayInSeconds: number;
}

/**
 * Resets the delay timer of an existing delayed BullMQ job (debounce pattern).
 *
 * Increments `countDelayed` on the job data. When `countDelayed` reaches
 * `maxCountDelayed`, the job is promoted to the waiting state so it runs
 * immediately on the next worker cycle. Otherwise, `job.changeDelay()` and
 * `job.update()` are called in parallel to reset the timer and update the
 * stored payload.
 *
 * @param params - {@link DelayJobParams}
 * @returns A `Response` containing the updated `Job` on success, or a typed
 *   error on failure.
 */
export const delayJob = async <QueueMethods extends BaseQueueMethods>(
    params: DelayJobParams<QueueMethods>,
): Promise<Response<Job<DelayedJobData<QueueMethods>>, SetJobErrorCode>> => {
    const { job, maxCountDelayed, onDelayedJob, newPayload, newDelayInSeconds } = params;

    try {
        const newCountDelayed = (job.data?.countDelayed || 0) + 1;

        if (typeof maxCountDelayed === "number" && newCountDelayed >= maxCountDelayed) {
            try {
                await job.promote();
            } catch (e) {
                return {
                    hasFailed: true,
                    error: {
                        code: SET_JOB_ERROR_CODE.ERROR_WHILE_PROMOTING_QUEUE_JOB,
                        message: `${job.name}: ${getErrorMessage(e)}`,
                    },
                };
            }
        } else {
            try {
                await Promise.all([
                    job.changeDelay(newDelayInSeconds * 1000),
                    job.updateData({
                        ...newPayload,
                        delayInSeconds: newDelayInSeconds,
                        countDelayed: newCountDelayed,
                    } as DelayedJobData<QueueMethods>),
                ]);
            } catch (e) {
                return {
                    hasFailed: true,
                    error: {
                        code: SET_JOB_ERROR_CODE.ERROR_WHILE_CHANGE_DELAY_QUEUE_JOB,
                        message: `${job.name}: ${getErrorMessage(e)}`,
                    },
                };
            }
        }

        onDelayedJob?.(job);

        return { hasFailed: false, data: job };
    } catch (e) {
        return {
            hasFailed: true,
            error: {
                code: SET_JOB_ERROR_CODE.ERROR_WHILE_DELAY_QUEUE_JOB,
                message: getErrorMessage(e),
            },
        };
    }
};
