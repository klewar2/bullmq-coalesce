import { JobStatus } from "../types.js";

/**
 * The default maximum number of jobs fetched in a single batch operation.
 * Used when no explicit `maximumJobsCount` is provided to job-listing functions.
 */
export const MAXIMUM_JOBS_NUMBER_DEFAULT = 1000;

/**
 * The set of job statuses that represent a job which is currently active or
 * scheduled to be processed. Used as the default filter in job-listing operations.
 *
 * Includes:
 * - `wait`    – waiting to be picked up by a worker
 * - `delayed` – scheduled for future execution
 * - `active`  – currently being processed by a worker
 */
export const RUNNING_JOB_STATUSES: JobStatus[] = [JobStatus.WAIT, JobStatus.DELAYED, JobStatus.ACTIVE];
