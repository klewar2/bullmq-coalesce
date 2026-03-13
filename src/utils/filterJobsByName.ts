import { Job } from "bullmq";

/**
 * Parameters for {@link filterJobsByName}.
 */
export interface FilterJobsByNameParams {
    /** The array of BullMQ `Job` objects to filter. */
    jobs: Job<unknown, unknown, string>[];
    /**
     * Optional list of names to keep. When omitted, all jobs are returned.
     */
    names?: string[];
}

/**
 * Filters an in-memory array of BullMQ jobs to include only those whose
 * `name` is present in the provided `names` list.
 *
 * When `names` is not provided, all jobs are returned unchanged.
 *
 * @param params - {@link FilterJobsByNameParams}
 * @returns An array of `Job` objects whose name matches one of the requested names.
 *
 * @example
 * const filtered = filterJobsByName({ jobs: allJobs, names: ["sendEmail"] });
 */
export const filterJobsByName = ({ jobs, names }: FilterJobsByNameParams): Job<unknown, unknown, string>[] => {
    if (!names) return jobs;
    return jobs.filter((job) => names.includes(job.name));
};
