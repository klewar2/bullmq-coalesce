import { GET_JOB_NAMES_ERROR_CODE } from "../constants.js";
import { GetJobNamesErrorCode, PlayJobNowProps } from "../types.js";
import { BaseQueueMethods, Response } from "../utils/types.js";
import { getErrorMessage } from "../utils/getErrorMessage.js";

/**
 * Promotes a delayed job to the waiting state so that a worker picks it up
 * immediately, bypassing its scheduled delay.
 *
 * Returns `null` in the success case when no job with the given name exists.
 *
 * @param params - {@link PlayJobNowProps}
 * @returns A `Response` containing the job name on success (or `null` if the
 *   job was not found), or a typed error on failure.
 */
export const playJobNow = async <QueueMethods extends BaseQueueMethods>(
    params: PlayJobNowProps<QueueMethods>,
): Promise<Response<string | null, GetJobNamesErrorCode>> => {
    const { internalQueue, name } = params;

    try {
        const job = await internalQueue.queue.getJob(name);
        if (!job) return { hasFailed: false, data: null };

        await job.promote();
        return { hasFailed: false, data: job.name };
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
