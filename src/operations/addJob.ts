import { Job } from "bullmq";
import { SET_JOB_ERROR_CODE } from "../constants.js";
import { AddJobParams, DelayedJobData, GetJobErrorCode, SetJobErrorCode } from "../types.js";
import { BaseQueueMethods, Response } from "../utils/types.js";
import { getExistingJob } from "./getExistingJob.js";

/**
 * Adds a new delayed job to the queue.
 *
 * If a job with the same name already exists in a terminal state
 * (`"unknown"`, `"completed"`, or `"failed"`), it is removed before the new
 * job is created. Jobs in active or delayed states are left untouched.
 *
 * The job data stored in BullMQ is the provided `payload` augmented with
 * `countDelayed: 0` and the requested `delayInSeconds`.
 *
 * @param params - {@link AddJobParams}
 * @returns A `Response` containing the newly created `Job` on success, or a
 *   typed error on failure.
 */
export const addJob = async <QueueMethods extends BaseQueueMethods>(
    params: AddJobParams<QueueMethods>,
): Promise<Response<Job<DelayedJobData<QueueMethods>>, SetJobErrorCode | GetJobErrorCode>> => {
    const { internalQueue, name, payload, delayInSeconds, onAddedJob, priority } = params;

    const existingJobResult = await getExistingJob<QueueMethods>({ name, internalQueue });
    if (existingJobResult.hasFailed) {
        return { hasFailed: true, error: existingJobResult.error };
    }

    const existingJob = existingJobResult.data;

    try {
        if (existingJob) {
            const existingJobState = await existingJob.getState();
            if (existingJobState === "unknown" || existingJobState === "completed" || existingJobState === "failed") {
                await existingJob.remove();
            }
        }

        const jobData = { ...payload, countDelayed: 0, delayInSeconds } as DelayedJobData<QueueMethods>;
        const createdJob = await internalQueue.queue.add(name, jobData, {
            delay: delayInSeconds * 1000,
            jobId: name,
            removeOnComplete: true,
            removeOnFail: true,
            priority,
        });

        onAddedJob?.(createdJob);

        return { hasFailed: false, data: createdJob };
    } catch {
        return {
            hasFailed: true,
            error: {
                code: SET_JOB_ERROR_CODE.ERROR_WHILE_CREATE_QUEUE_JOB,
                message: `Method: ${name} | Delay: ${delayInSeconds}s`,
            },
        };
    }
};
