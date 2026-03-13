import { Job } from "bullmq";
import { SET_JOB_ERROR_CODE } from "../constants.js";
import { AddOrDelayJobParams, DelayedJobData, GetJobErrorCode, SetJobErrorCode } from "../types.js";
import { BaseQueueMethods, Response } from "../utils/types.js";
import { isDelayedJobType } from "../helpers.js";
import { getExistingJob } from "./getExistingJob.js";
import { delayJob } from "./delayJob.js";

/**
 * Adds a delayed job to the queue, or coalesces it with an existing one.
 *
 * **Coalescing behaviour:**
 * - If a job with the same `name` is already in the `delayed` state **and**
 *   passes the {@link isDelayedJobType} check, its delay timer is reset via
 *   {@link delayJob} (debounce pattern). No new job is created.
 * - If the existing job is in any other state (`active`, `completed`, etc.) it
 *   is removed if terminal, then a brand-new job is created.
 * - If no job exists, a new job is created immediately.
 *
 * @param params - {@link AddOrDelayJobParams}
 * @returns A `Response` containing the affected `Job` on success, or a typed
 *   error on failure.
 */
export const addOrDelayJob = async <QueueMethods extends BaseQueueMethods>(
    params: AddOrDelayJobParams<QueueMethods>,
): Promise<Response<Job<DelayedJobData<QueueMethods>>, SetJobErrorCode | GetJobErrorCode>> => {
    const { internalQueue, name, payload, delayInSeconds, onAddedJob, onDelayedJob, maxCountDelayed, priority } = params;

    const existingJobResult = await getExistingJob<QueueMethods>({ name, internalQueue });
    if (existingJobResult.hasFailed) {
        return { hasFailed: true, error: existingJobResult.error };
    }

    const existingJob = existingJobResult.data;
    const isExistingJobDelayed =
        !!existingJob && (await existingJob.isDelayed()) && isDelayedJobType<QueueMethods>(existingJob, internalQueue.methods);

    if (isExistingJobDelayed) {
        return delayJob<QueueMethods>({
            job: existingJob,
            newPayload: payload,
            maxCountDelayed,
            onDelayedJob,
            newDelayInSeconds: delayInSeconds,
        });
    }

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
