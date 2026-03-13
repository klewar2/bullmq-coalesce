import { Job, Queue } from "bullmq";
import {
    ASYNC_REDIS_SCAN_ERROR_CODE,
    GET_JOB_COUNT_ERROR_CODE,
    GET_JOB_ERROR_CODE,
    GET_JOB_NAMES_ERROR_CODE,
    REMOVE_JOB_ERROR_CODE,
    RETURN_VALUE_REASON_CODE,
    SET_JOB_ERROR_CODE,
    STOP_QUEUE_ERROR_CODE,
} from "./constants.js";
import { BaseQueueMethods, EnumType, ErrorType, Response } from "./utils/types.js";

// Re-export shared utility types for consumers of this package.
export type { BaseQueueMethods, EnumType, ErrorType, Response, Method, QueueMethodParams } from "./utils/types.js";

// ---------------------------------------------------------------------------
// Job status enum
// ---------------------------------------------------------------------------

/**
 * The set of BullMQ job lifecycle statuses recognised by `bullmq-coalesce`.
 *
 * These map directly to the status strings used by BullMQ's `getJobs()` API.
 */
export enum JobStatus {
    WAIT = "wait",
    DELAYED = "delayed",
    ACTIVE = "active",
    FAILED = "failed",
}

// ---------------------------------------------------------------------------
// Job data shapes
// ---------------------------------------------------------------------------

/**
 * A helper type that, for each method key `K` in `QueueMethods`, produces a
 * discriminated-union member `{ method: K; params: Parameters<QueueMethods[K]>[0] }`.
 *
 * The full union over all keys in `QueueMethods` allows callers to pass
 * strongly-typed `{ method, params }` pairs without losing type safety.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export type DelayedMethodsAndDataType<QueueMethods extends BaseQueueMethods> = {
    [key in keyof QueueMethods]: {
        method: key;
        params: Parameters<QueueMethods[key]>[0] extends undefined ? unknown : Parameters<QueueMethods[key]>[0];
    };
}[keyof QueueMethods];

/**
 * The data payload stored inside every BullMQ job managed by `bullmq-coalesce`.
 *
 * Extends the method/params discriminated union with bookkeeping fields used
 * by the coalescing logic.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export type DelayedJobData<QueueMethods extends BaseQueueMethods> = DelayedMethodsAndDataType<QueueMethods> & {
    /** How many times this job has been re-delayed instead of executed. */
    countDelayed: number;
    /** The most recent delay applied to this job, in seconds. */
    delayInSeconds: number;
};

/**
 * A record of async methods that can be registered as handlers on the queue.
 * Identical to {@link BaseQueueMethods} but typed explicitly for delayed jobs.
 */
export type BaseDelayedQueueMethods = Record<string, (params?: unknown) => Promise<unknown>>;

// ---------------------------------------------------------------------------
// Internal queue state
// ---------------------------------------------------------------------------

/**
 * Holds the BullMQ `Queue` instance and the registered method handlers.
 *
 * @internal This type is used internally by operation functions and the
 *   `CoalescedQueue` class. It is exported so that operation modules can
 *   reference it, but consumers of the library should not depend on it directly.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export type InternalQueueState<QueueMethods extends BaseQueueMethods> = {
    /** The underlying BullMQ `Queue` instance. */
    queue: Queue<DelayedJobData<QueueMethods>, unknown, string>;
    /** The registered method handlers keyed by method name. */
    methods: BaseDelayedQueueMethods;
};

// ---------------------------------------------------------------------------
// Operation parameter types
// ---------------------------------------------------------------------------

/**
 * Parameters accepted by the {@link addJob} operation.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export interface AddJobParams<QueueMethods extends BaseQueueMethods> {
    /** The internal queue state. */
    internalQueue: InternalQueueState<QueueMethods>;
    /** Unique job identifier and display name. */
    name: string;
    /** The strongly-typed method/params payload to store in the job. */
    payload: DelayedMethodsAndDataType<QueueMethods>;
    /** How long to delay the job before it becomes active, in seconds. */
    delayInSeconds: number;
    /**
     * Optional callback invoked immediately after the job is successfully
     * added to the queue.
     */
    onAddedJob?: (job: Job<DelayedJobData<QueueMethods>>) => void;
    /** Optional BullMQ priority (lower number = higher priority). */
    priority?: number;
}

/**
 * Parameters accepted by the {@link addOrDelayJob} operation.
 * Extends {@link AddJobParams} with coalescing-specific options.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export interface AddOrDelayJobParams<QueueMethods extends BaseQueueMethods> extends AddJobParams<QueueMethods> {
    /**
     * When set, a job that has already been delayed this many times will be
     * promoted to run immediately instead of being delayed again.
     */
    maxCountDelayed?: number;
    /**
     * Optional callback invoked when an existing delayed job has its timer
     * reset instead of a new job being created.
     */
    onDelayedJob?: (job: Job<DelayedJobData<QueueMethods>>) => void;
}

// ---------------------------------------------------------------------------
// Prop types for operation functions
// ---------------------------------------------------------------------------

/**
 * Parameters for the {@link removeJob} operation.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export interface RemoveJobProps<QueueMethods extends BaseQueueMethods> {
    /** The internal queue state. */
    internalQueue: InternalQueueState<QueueMethods>;
    /** The BullMQ job ID (typically the same as the job name). */
    jobId: string;
}

/**
 * Parameters for the {@link getFailedJobs} operation.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export interface GetFailedJobsProps<QueueMethods extends BaseQueueMethods> {
    /** The internal queue state. */
    internalQueue: InternalQueueState<QueueMethods>;
    /** Start offset for pagination (default: `0`). */
    start?: number;
    /** Maximum number of failed jobs to return. */
    length?: number;
}

/**
 * Parameters for the {@link getJobNames} and {@link getJobs} operations.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export interface GetJobNamesProps<QueueMethods extends BaseQueueMethods> {
    /** The internal queue state. */
    internalQueue: InternalQueueState<QueueMethods>;
    /** Optional filter: only jobs whose name is in this list are returned. */
    names?: string[];
    /** Maximum number of jobs to process per batch (default: `1000`). */
    maximumJobsCount?: number;
    /** Job statuses to include (default: wait, delayed, active). */
    jobStatuses?: JobStatus[];
}

/**
 * Parameters for the {@link fetchJobsByNames} and {@link getMissingJobs} operations.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export interface FetchJobsByNamesProps<QueueMethods extends BaseQueueMethods> {
    /** The internal queue state. */
    internalQueue: InternalQueueState<QueueMethods>;
    /** The exact list of job names to look up. */
    names: string[];
    /** Maximum number of jobs to process per batch. */
    maximumJobsCount?: number;
    /** Job statuses to include. */
    jobStatuses?: JobStatus[];
}

/**
 * Parameters for the {@link countJobs} operation.
 */
export interface CountJobsProps {
    /** A BullMQ `Queue` instance to count jobs on. */
    bullQueue: Queue;
    /** The statuses to include in the total count. */
    statuses: JobStatus[];
}

/**
 * Parameters for the {@link playJobNow} operation.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export interface PlayJobNowProps<QueueMethods extends BaseQueueMethods> {
    /** The internal queue state. */
    internalQueue: InternalQueueState<QueueMethods>;
    /** The name of the job to promote to the waiting state immediately. */
    name: string;
}

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

/**
 * The return type of {@link fetchJobsByNames}: a pairing of each requested job
 * name with the corresponding BullMQ `Job` (or `undefined` if not found).
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export type FetchJobsByNamesResult<QueueMethods extends BaseQueueMethods> = Array<{
    jobName: string;
    job: Job<DelayedJobData<QueueMethods>> | undefined;
}>;

// ---------------------------------------------------------------------------
// Error code types
// ---------------------------------------------------------------------------

/** Union of error codes that {@link stopQueue} can return. */
export type StopErrorCode = EnumType<typeof STOP_QUEUE_ERROR_CODE>;

/** Union of error codes that {@link removeJob} can return. */
export type RemoveJobErrorCode = EnumType<typeof REMOVE_JOB_ERROR_CODE>;

/** Union of error codes that {@link getJobNames} can return. */
export type GetJobNamesErrorCode = EnumType<typeof GET_JOB_NAMES_ERROR_CODE>;

/** Union of error codes that {@link countJobs} can return. */
export type GetJobCountErrorCode = EnumType<typeof GET_JOB_COUNT_ERROR_CODE>;

/** Union of error codes that {@link getExistingJob} can return. */
export type GetJobErrorCode = EnumType<typeof GET_JOB_ERROR_CODE>;

/** Union of error codes that job scheduling operations can return. */
export type SetJobErrorCode = EnumType<typeof SET_JOB_ERROR_CODE>;

/** Reason codes used in job handler return values. */
export type ReturnValueErrorCode = EnumType<typeof RETURN_VALUE_REASON_CODE>;

/** Union of error codes that {@link asyncRedisScan} can return. */
export type AsyncRedisScanErrorCode = EnumType<typeof ASYNC_REDIS_SCAN_ERROR_CODE>;

/** A typed stop error returned when queue shutdown fails. */
export type OnStopError = ErrorType<StopErrorCode>;

// ---------------------------------------------------------------------------
// CoalescedQueue constructor params
// ---------------------------------------------------------------------------

/**
 * Constructor parameters for {@link CoalescedQueue}.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map defining the
 *   methods that jobs in this queue can invoke.
 */
export interface CoalescedQueueParams<QueueMethods extends BaseQueueMethods> {
    /** The BullMQ queue name. Must be unique per Redis instance. */
    name: string;
    /** A full Redis connection URL (e.g. `redis://localhost:6379`). */
    redisUrl: string;
    /** The async methods that job processors will call. Keys must match job `method` values. */
    methods: QueueMethods;
    /**
     * Called when the queue or worker cannot be shut down cleanly.
     * Receives a typed {@link OnStopError} describing the failure.
     */
    onStopError?: (error: OnStopError) => void;
    /**
     * Called when the job processor (`handleJob`) throws an unexpected error.
     */
    onHandleError?: (error: Error) => void;
    /**
     * Called after a job has been successfully processed.
     */
    onHandleSuccess?: (job: Job<DelayedJobData<QueueMethods>>) => void;
    /**
     * An optional async guard called before each job is executed.
     * Return `{ hasFailed: true, retry: true }` to re-queue the job, or
     * `{ hasFailed: true, retry: false }` to drop it.
     */
    onBeforeExecuteJob?: (job: Job<DelayedJobData<QueueMethods>>) => Promise<Response<undefined, ReturnValueErrorCode>>;
    /**
     * Called immediately after the registered method has been invoked for a job,
     * before the response is returned to BullMQ.
     */
    onExecuteJob?: (job: Job<DelayedJobData<QueueMethods>>) => void;
    /**
     * Called when the BullMQ worker emits the `"completed"` event.
     * Only fires when the completed job passes the {@link isDelayedJobType} check.
     */
    onJobCompleted?: (params: {
        job: Job<DelayedJobData<QueueMethods>>;
        returnValue: unknown;
        internalQueue: InternalQueueState<QueueMethods>;
    }) => void;
    /**
     * Called when the BullMQ worker emits the `"error"` event.
     */
    onErrorJob?: (error: Error) => void;
    /**
     * Called when the BullMQ worker emits the `"failed"` event for a job.
     */
    onFailedJob?: (job: Job<DelayedJobData<QueueMethods>>, error: Error) => void;
    /**
     * Default maximum number of times a job can be re-delayed before it is
     * promoted to run immediately.
     *
     * Can be overridden per call in {@link CoalescedQueue.addOrDelayJob}.
     * When omitted, jobs can be delayed indefinitely.
     */
    defaultMaxCountDelayed?: number;
    /** Number of concurrent jobs the worker will process simultaneously. */
    concurrency?: number;
    /** How long (in ms) the worker holds the job lock before it expires. */
    lockDuration?: number;
}
