import { Job } from "bullmq";
import { BaseQueueMethods } from "./types.js";
import { DelayedJobData, InternalQueueState, JobStatus } from "../types.js";

/**
 * Parameters for fetching a single batch of jobs from the queue.
 */
export interface GetBatchJobsParams<QueueMethods extends BaseQueueMethods> {
    /** The internal queue state containing the BullMQ Queue instance. */
    internalQueue: InternalQueueState<QueueMethods>;
    /** Zero-based batch index used to calculate the start offset. */
    index: number;
    /** Maximum number of jobs per batch. */
    maximumJobsCount: number;
    /** Job statuses to include in the result. */
    jobStatuses: JobStatus[];
}

/**
 * Fetches a single paginated batch of jobs from the BullMQ queue.
 *
 * Calculates `start` and `end` offsets from `index * maximumJobsCount` and
 * delegates to `queue.getJobs()`.
 *
 * @param params - {@link GetBatchJobsParams}
 * @returns A promise that resolves to an array of BullMQ `Job` objects for the
 *   requested page.
 */
export const getBatchJobs = async <QueueMethods extends BaseQueueMethods>(
    params: GetBatchJobsParams<QueueMethods>,
): Promise<Job<DelayedJobData<QueueMethods>, unknown, string>[]> => {
    const { internalQueue, index, maximumJobsCount, jobStatuses } = params;
    const start = index * maximumJobsCount;
    const end = start + maximumJobsCount - 1;
    return internalQueue.queue.getJobs(jobStatuses, start, end) as Promise<Job<DelayedJobData<QueueMethods>, unknown, string>[]>;
};
