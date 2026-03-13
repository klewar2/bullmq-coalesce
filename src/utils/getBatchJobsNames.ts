import { Job } from "bullmq";

/**
 * Parameters for extracting job names from a batch of BullMQ jobs.
 */
export interface GetBatchJobsNamesParams {
    /** The array of BullMQ `Job` objects to process. */
    jobs: Job<unknown, unknown, string>[];
    /**
     * Optional list of names to filter by. When provided, only jobs whose
     * `name` appears in this array are included in the result.
     */
    names?: string[];
}

/**
 * Extracts the `name` property from an array of BullMQ jobs, with an optional
 * filter to include only jobs matching a given set of names.
 *
 * @param params - {@link GetBatchJobsNamesParams}
 * @returns An array of job name strings.
 *
 * @example
 * const names = getBatchJobsNames({ jobs, names: ["sendEmail", "generateReport"] });
 */
export const getBatchJobsNames = ({ jobs, names }: GetBatchJobsNamesParams): string[] => {
    const filtered = names ? jobs.filter((job) => names.includes(job.name)) : jobs;
    return filtered.map((job) => job.name);
};
