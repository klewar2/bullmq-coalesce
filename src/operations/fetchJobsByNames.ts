import { GET_JOB_NAMES_ERROR_CODE } from "../constants.js";
import { FetchJobsByNamesProps, FetchJobsByNamesResult, GetJobNamesErrorCode } from "../types.js";
import { BaseQueueMethods, Response } from "../utils/types.js";
import { getErrorMessage } from "../utils/getErrorMessage.js";

/**
 * Fetches specific jobs by name directly from Redis, returning a pairing of
 * each requested name with its corresponding `Job` object (or `undefined` if
 * not found).
 *
 * Unlike {@link getJobs} which scans the full queue, this performs a targeted
 * parallel lookup — one `queue.getJob(name)` call per entry via `Promise.all`.
 * Use this when you already know the names of the jobs you want.
 *
 * @param params - {@link FetchJobsByNamesProps}
 * @returns A `Response` containing a {@link FetchJobsByNamesResult} array on
 *   success, or a typed error on failure.
 */
export const fetchJobsByNames = async <QueueMethods extends BaseQueueMethods>(
    params: FetchJobsByNamesProps<QueueMethods>,
): Promise<Response<FetchJobsByNamesResult<QueueMethods>, GetJobNamesErrorCode>> => {
    const { internalQueue, names } = params;

    try {
        const jobs = await Promise.all(
            names.map(async (name) => {
                const job = await internalQueue.queue.getJob(name);
                return { jobName: name, job: job as FetchJobsByNamesResult<QueueMethods>[number]["job"] };
            }),
        );

        return { hasFailed: false, data: jobs };
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
