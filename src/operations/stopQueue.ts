import { Queue, Worker } from "bullmq";
import { STOP_QUEUE_ERROR_CODE } from "../constants.js";
import { StopErrorCode } from "../types.js";
import { Response } from "../utils/types.js";
import { getErrorMessage } from "../utils/getErrorMessage.js";

/**
 * Parameters for {@link stopQueue}.
 */
export interface StopQueueParams {
    /** The BullMQ `Queue` to pause and close. May be omitted if not available. */
    queue?: Queue;
    /** The BullMQ `Worker` to close. */
    worker: Worker;
}

/**
 * Gracefully shuts down a BullMQ queue and its associated worker.
 *
 * The queue is paused before being closed to prevent new jobs from being
 * picked up mid-shutdown. The worker is then closed, allowing any
 * in-progress jobs to finish (up to the lock duration).
 *
 * @param params - {@link StopQueueParams}
 * @returns A `Response` containing `null` on success, or a typed
 *   {@link StopErrorCode} error when any step fails.
 */
export const stopQueue = async (params: StopQueueParams): Promise<Response<null, StopErrorCode>> => {
    const { queue, worker } = params;

    try {
        await queue?.pause();
        await queue?.close();
    } catch (e) {
        return {
            hasFailed: true,
            error: {
                code: STOP_QUEUE_ERROR_CODE.ERROR_WHILE_CLOSING_QUEUE,
                message: getErrorMessage(e),
            },
        };
    }

    try {
        await worker.close();
    } catch (e) {
        return {
            hasFailed: true,
            error: {
                code: STOP_QUEUE_ERROR_CODE.ERROR_WHILE_CLOSING_WORKER,
                message: getErrorMessage(e),
            },
        };
    }

    return { hasFailed: false, data: null };
};
