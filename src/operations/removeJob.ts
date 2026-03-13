import { REMOVE_JOB_ERROR_CODE } from "../constants.js";
import { RemoveJobErrorCode, RemoveJobProps } from "../types.js";
import { BaseQueueMethods, Response } from "../utils/types.js";
import { getErrorMessage } from "../utils/getErrorMessage.js";

/**
 * Removes a job from the BullMQ queue by its job ID.
 *
 * @param params - {@link RemoveJobProps}
 * @returns A `Response` containing `null` on success (removal is a void
 *   operation), or a typed error on failure.
 */
export const removeJob = async <QueueMethods extends BaseQueueMethods>(
    params: RemoveJobProps<QueueMethods>,
): Promise<Response<null, RemoveJobErrorCode>> => {
    const { internalQueue, jobId } = params;

    try {
        await internalQueue.queue.remove(jobId);
        return { hasFailed: false, data: null };
    } catch (e) {
        return {
            hasFailed: true,
            error: {
                code: REMOVE_JOB_ERROR_CODE.ERROR_WHILE_REMOVING_JOB,
                message: getErrorMessage(e),
            },
        };
    }
};
