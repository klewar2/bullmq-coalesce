import { Job } from "bullmq";
import { GET_JOB_NAMES_ERROR_CODE } from "../constants.js";
import { DelayedJobData, GetJobNamesErrorCode, GetJobNamesProps } from "../types.js";
import { BaseQueueMethods, Response } from "../utils/types.js";
import { getErrorMessage } from "../utils/getErrorMessage.js";
import { MAXIMUM_JOBS_NUMBER_DEFAULT, RUNNING_JOB_STATUSES } from "../utils/constants.js";
import { getBatchJobs } from "../utils/getBatchJobs.js";
import { filterJobsByName } from "../utils/filterJobsByName.js";
import { countJobs } from "./countJobs.js";

/**
 * Retrieves full BullMQ `Job` objects from the queue matching the given criteria.
 *
 * Jobs are fetched in batches of `maximumJobsCount` (default `1000`). An
 * optional `names` filter narrows the result to only those jobs whose name is
 * present in the list.
 *
 * @param params - {@link GetJobNamesProps}
 * @returns A `Response` containing an array of `Job` objects on success, or a
 *   typed error on failure.
 */
export const getJobs = async <QueueMethods extends BaseQueueMethods>(
    params: GetJobNamesProps<QueueMethods>,
): Promise<Response<Job<DelayedJobData<QueueMethods>, unknown, string>[], GetJobNamesErrorCode>> => {
    const { internalQueue, names, maximumJobsCount = MAXIMUM_JOBS_NUMBER_DEFAULT, jobStatuses = RUNNING_JOB_STATUSES } = params;

    try {
        const jobsCountResponse = await countJobs({ bullQueue: internalQueue.queue, statuses: jobStatuses });
        if (jobsCountResponse.hasFailed) {
            return {
                hasFailed: true,
                error: {
                    code: GET_JOB_NAMES_ERROR_CODE.ERROR_WHILE_GETTING_JOBS,
                    message: jobsCountResponse.error.message,
                },
            };
        }

        const jobsCount = jobsCountResponse.data;
        const batchIndexes = [...Array(Math.ceil(jobsCount / maximumJobsCount))];

        const jobBatches = await Promise.all(
            batchIndexes.map(async (_, index) => {
                const jobs = await getBatchJobs({ internalQueue, index, maximumJobsCount, jobStatuses });
                return filterJobsByName({ jobs, names });
            }),
        );

        return { hasFailed: false, data: jobBatches.flat() as Job<DelayedJobData<QueueMethods>, unknown, string>[] };
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
