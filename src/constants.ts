/**
 * Error codes returned by {@link stopQueue} when it fails to shut down the queue
 * or the worker cleanly.
 */
export const STOP_QUEUE_ERROR_CODE = {
    /** Thrown when closing the BullMQ `Queue` instance fails. */
    ERROR_WHILE_CLOSING_QUEUE: "error_while_closing_queue",
    /** Thrown when closing the BullMQ `Worker` instance fails. */
    ERROR_WHILE_CLOSING_WORKER: "error_while_closing_worker",
} as const;

/**
 * Error codes returned by {@link removeJob} when job removal fails.
 */
export const REMOVE_JOB_ERROR_CODE = {
    /** Thrown when the queue fails to remove the specified job. */
    ERROR_WHILE_REMOVING_JOB: "error_while_removing_job",
} as const;

/**
 * Error codes returned by {@link getJobNames} when listing job names fails.
 */
export const GET_JOB_NAMES_ERROR_CODE = {
    /** Thrown when fetching or iterating over jobs in the queue fails. */
    ERROR_WHILE_GETTING_JOBS: "error_while_getting_jobs",
} as const;

/**
 * Error codes returned by {@link countJobs} when job counting fails.
 */
export const GET_JOB_COUNT_ERROR_CODE = {
    /** Thrown when `queue.getJobCounts()` raises an error. */
    ERROR_WHILE_COUNTING_QUEUE_JOBS: "error_while_counting_queue_jobs",
} as const;

/**
 * Error codes returned by {@link getExistingJob} when fetching a job fails.
 */
export const GET_JOB_ERROR_CODE = {
    /** Thrown when `queue.getJob()` raises an error. */
    ERROR_WHILE_GETTING_QUEUE_JOBS: "error_while_getting_queue_jobs",
} as const;

/**
 * Error codes returned by job scheduling operations such as {@link addJob},
 * {@link addOrDelayJob}, and {@link delayJob}.
 */
export const SET_JOB_ERROR_CODE = {
    /** Thrown when `job.changeDelay()` or `job.update()` fails during a delay reset. */
    ERROR_WHILE_CHANGE_DELAY_QUEUE_JOB: "error_while_change_delay_queue_job",
    /** Thrown when `job.promote()` fails while trying to run a job immediately. */
    ERROR_WHILE_PROMOTING_QUEUE_JOB: "error_while_promoting_queue_job",
    /** Thrown when `queue.add()` fails while creating a new job. */
    ERROR_WHILE_CREATE_QUEUE_JOB: "error_while_create_queue_job",
    /** Thrown when an unspecified error occurs during the delay operation. */
    ERROR_WHILE_DELAY_QUEUE_JOB: "error_while_delay_queue_job",
    /** Thrown when a required job cannot be found in the queue. */
    ERROR_WHILE_NOT_FOUND_QUEUE_JOB: "error_while_not_found_queue_job",
} as const;

/**
 * Reason codes used as the return value of a job handler when the job cannot
 * be processed at this time.
 */
export const RETURN_VALUE_REASON_CODE = {
    /** The job was rejected due to rate limiting. */
    RATE_LIMIT: "rate_limit",
    /** The job was rejected for an unspecified reason. */
    OTHER: "other",
} as const;

/**
 * Error codes returned by {@link asyncRedisScan} when the Redis key scan fails.
 */
export const ASYNC_REDIS_SCAN_ERROR_CODE = {
    /** Thrown when the Redis `SCAN` command raises an error. */
    ERROR_WHILE_SCANNING_REDIS: "error_while_scanning_redis",
} as const;
