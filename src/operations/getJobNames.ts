import { GET_JOB_NAMES_ERROR_CODE } from "../constants.js";
import { GetJobNamesErrorCode, GetJobNamesProps } from "../types.js";
import { BaseQueueMethods, Response } from "../utils/types.js";
import { getErrorMessage } from "../utils/getErrorMessage.js";
import { MAXIMUM_JOBS_NUMBER_DEFAULT, RUNNING_JOB_STATUSES } from "../utils/constants.js";
import { getBatchJobs } from "../utils/getBatchJobs.js";
import { getBatchJobsNames } from "../utils/getBatchJobsNames.js";
import { countJobs } from "./countJobs.js";

/**
 * Retrieves the names of all jobs in the queue matching the given criteria.
 *
 * Jobs are fetched in batches of `maximumJobsCount` (default `1000`). Each
 * batch is processed in parallel. An optional `names` filter narrows the
 * result to only those job names present in the list.
 *
 * @param params - {@link GetJobNamesProps}
 * @returns A `Response` containing an array of job name strings on success, or
 *   a typed error on failure.
 */
export const getJobNames = async <QueueMethods extends BaseQueueMethods>(
    params: GetJobNamesProps<QueueMethods>,
): Promise<Response<string[], GetJobNamesErrorCode>> => {
    const { internalQueue, names, maximumJobsCount = MAXIMUM_JOBS_NUMBER_DEFAULT, jobStatuses = RUNNING_JOB_STATUSES } = params;

    try {
        const jobsCountResponse = await countJobs({ bullQueue: internalQueue.queue, statuses: jobStatuses });
        if (jobsCountResponse.hasFailed) throw new Error(jobsCountResponse.error.message);

        const jobsCount = jobsCountResponse.data;
        const batchIndexes = [...Array(Math.ceil(jobsCount / maximumJobsCount))];

        const jobBatches = await Promise.all(
            batchIndexes.map(async (_, index) => {
                const jobs = await getBatchJobs({ internalQueue, index, maximumJobsCount, jobStatuses });
                return getBatchJobsNames({ jobs, names });
            }),
        );

        return { hasFailed: false, data: jobBatches.flat() };
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
