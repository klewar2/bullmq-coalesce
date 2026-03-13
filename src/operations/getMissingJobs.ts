import { GET_JOB_NAMES_ERROR_CODE } from "../constants.js";
import { chunk } from "../utils/chunk.js";
import { FetchJobsByNamesProps, GetJobNamesErrorCode } from "../types.js";
import { BaseQueueMethods, Response } from "../utils/types.js";
import { getErrorMessage } from "../utils/getErrorMessage.js";

/**
 * Finds job names from the provided list that are **not** currently present in
 * an active, delayed, or waiting state in the queue.
 *
 * Names are checked in chunks of 500 to avoid overwhelming Redis with a single
 * large batch. For each name the job state is fetched; if the job does not
 * exist or is in any state other than `"active"`, `"delayed"`, or `"waiting"`,
 * the name is included in the result.
 *
 * @param params - {@link FetchJobsByNamesProps}
 * @returns A `Response` containing an array of missing job names on success, or
 *   a typed error on failure.
 */
export const getMissingJobs = async <QueueMethods extends BaseQueueMethods>(
    params: FetchJobsByNamesProps<QueueMethods>,
): Promise<Response<string[], GetJobNamesErrorCode>> => {
    const { internalQueue, names } = params;

    try {
        const chunkedNames = chunk(names, 500);
        const results: Array<{ jobName: string; isJobExisting: boolean }> = [];

        for (const namesChunk of chunkedNames) {
            const chunkResults = await Promise.all(
                namesChunk.map(async (name) => {
                    const job = await internalQueue.queue.getJob(name);
                    const jobState = job ? await job.getState() : "unknown";
                    return {
                        jobName: name,
                        isJobExisting: ["active", "delayed", "waiting"].includes(jobState),
                    };
                }),
            );
            results.push(...chunkResults);
        }

        const missingJobNames = results.reduce<string[]>((acc, { jobName, isJobExisting }) => {
            if (!isJobExisting) acc.push(jobName);
            return acc;
        }, []);

        return { hasFailed: false, data: missingJobNames };
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
