import { Job, Queue, Worker } from "bullmq";
import {
    AddJobParams,
    AddOrDelayJobParams,
    AsyncRedisScanErrorCode,
    CoalescedQueueParams,
    CountJobsProps,
    DelayedJobData,
    GetJobCountErrorCode,
    GetJobErrorCode,
    GetJobNamesErrorCode,
    GetJobNamesProps,
    FetchJobsByNamesProps,
    FetchJobsByNamesResult,
    InternalQueueState,
    JobStatus,
    OnStopError,
    RemoveJobErrorCode,
    ReturnValueErrorCode,
    SetJobErrorCode,
    StopErrorCode,
} from "./types.js";
import { BaseQueueMethods, Response } from "./utils/types.js";
import { getRedisConnectionFromUrl } from "./utils/getRedisConnection.js";
import { isDelayedJobType } from "./helpers.js";
import { asyncRedisScan, AsyncRedisScanParams } from "./operations/asyncRedisScan.js";
import { addJob } from "./operations/addJob.js";
import { addOrDelayJob } from "./operations/addOrDelayJob.js";
import { countJobs } from "./operations/countJobs.js";
import { createWorker } from "./operations/createWorker.js";
import { getExistingJob } from "./operations/getExistingJob.js";
import { getFailedJobs } from "./operations/getFailedJobs.js";
import { getJobNames } from "./operations/getJobNames.js";
import { getJobs } from "./operations/getJobs.js";
import { fetchJobsByNames } from "./operations/fetchJobsByNames.js";
import { getMissingJobs } from "./operations/getMissingJobs.js";
import { playJobNow } from "./operations/playJobNow.js";
import { removeJob } from "./operations/removeJob.js";
import { stopQueue } from "./operations/stopQueue.js";

/**
 * A BullMQ wrapper that implements the **coalesced job** pattern.
 *
 * When you call {@link addOrDelayJob} for a job that is already in the
 * `delayed` state, instead of creating a duplicate job the existing job's
 * delay timer is reset (debounced). This is useful for workloads where you
 * want to batch rapid updates into a single eventual execution.
 *
 * The class exposes the underlying BullMQ {@link Queue} and {@link Worker}
 * instances as public readonly properties so that you can attach additional
 * BullMQ event listeners if needed.
 *
 * @typeParam QueueMethods - A record of async methods that jobs in this queue
 *   can invoke. Each key becomes a valid `method` value in the job payload.
 *
 * @example
 * ```typescript
 * type MyMethods = {
 *   sendEmail: (params: { to: string }) => Promise<void>;
 * };
 *
 * const queue = new CoalescedQueue<MyMethods>({
 *   name: "emails",
 *   redisUrl: "redis://localhost:6379",
 *   methods: {
 *     sendEmail: async ({ to }) => { ... },
 *   },
 * });
 *
 * await queue.start();
 * await queue.addOrDelayJob({
 *   name: `email:${userId}`,
 *   payload: { method: "sendEmail", params: { to: "user@example.com" } },
 *   delayInSeconds: 30,
 * });
 * ```
 */
export class CoalescedQueue<QueueMethods extends BaseQueueMethods> {
    /**
     * The underlying BullMQ `Queue` instance.
     * Can be used to attach custom event listeners or call BullMQ APIs directly.
     */
    public readonly queue: Queue<DelayedJobData<QueueMethods>, unknown, string>;

    /**
     * The underlying BullMQ `Worker` instance.
     * Can be used to attach custom event listeners.
     */
    public readonly worker: Worker;

    /** @internal */
    private readonly internalQueue: InternalQueueState<QueueMethods>;

    /** @internal */
    private readonly config: CoalescedQueueParams<QueueMethods>;

    /**
     * Creates a new `CoalescedQueue` instance.
     *
     * The constructor synchronously builds the BullMQ `Queue` and `Worker` and
     * wires up the configured event listeners. Call {@link start} to begin
     * processing jobs.
     *
     * @param params - {@link CoalescedQueueParams}
     */
    constructor(params: CoalescedQueueParams<QueueMethods>) {
        this.config = params;

        const {
            name,
            redisUrl,
            methods,
            onHandleError,
            onHandleSuccess,
            onBeforeExecuteJob,
            onExecuteJob,
            onFailedJob,
            concurrency,
            lockDuration,
        } = params;

        const connection = getRedisConnectionFromUrl(redisUrl);

        const { internalQueue, worker, start: workerStart } = createWorker<QueueMethods>({
            name,
            connection,
            methods,
            onBeforeExecuteJob,
            onExecuteJob,
            onHandleError,
            onHandleSuccess,
            onFailedJob,
            concurrency,
            lockDuration,
        });

        this.internalQueue = internalQueue;
        this.queue = internalQueue.queue;
        this.worker = worker;
        this._workerStart = workerStart;

        // Wire up worker event listeners.
        worker.on("error", (err) => {
            params.onErrorJob?.(err);
        });

        worker.on("failed", (job, error) => {
            if (job) {
                params.onFailedJob?.(job as Job<DelayedJobData<QueueMethods>>, error);
                return;
            }
            console.error("[CoalescedQueue] Worker emitted 'failed' with no job");
        });

        worker.on("completed", (job: Job<DelayedJobData<QueueMethods>>, returnValue) => {
            if (!params.onJobCompleted) return;
            if (!isDelayedJobType<QueueMethods>(job, internalQueue.methods)) return;

            params.onJobCompleted({
                job,
                returnValue,
                internalQueue,
            });
        });
    }

    /** @internal Stored `start` function returned by `createWorker`. */
    private readonly _workerStart: () => Promise<void>;

    // ---------------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------------

    /**
     * Starts the worker loop, enabling job processing.
     *
     * Safe to call multiple times — the underlying `worker.run()` is only
     * invoked when the worker is not already running.
     */
    public async start(): Promise<void> {
        await this._workerStart();
    }

    /**
     * Gracefully shuts down the queue and worker.
     *
     * Pauses the queue to prevent new pick-ups, closes the queue connection,
     * and then closes the worker. If any step fails, the optional
     * `onStopError` callback is called with the typed error.
     */
    public async stop(): Promise<void> {
        const response = await stopQueue({ queue: this.internalQueue.queue, worker: this.worker });
        if (response.hasFailed) {
            this.config.onStopError?.(response.error as OnStopError);
        }
    }

    // ---------------------------------------------------------------------------
    // Job scheduling
    // ---------------------------------------------------------------------------

    /**
     * Adds a new delayed job to the queue.
     *
     * If a job with the same `name` already exists in a terminal state
     * (`"unknown"`, `"completed"`, or `"failed"`), it is removed before the
     * new job is created.
     *
     * @param params - Job parameters (omit `internalQueue` — it is filled in
     *   automatically).
     * @returns A `Response` containing the created `Job` on success.
     */
    public addJob(
        params: Omit<AddJobParams<QueueMethods>, "internalQueue">,
    ): Promise<Response<Job<DelayedJobData<QueueMethods>>, SetJobErrorCode | GetJobErrorCode>> {
        return addJob<QueueMethods>({ ...params, internalQueue: this.internalQueue });
    }

    /**
     * Adds a delayed job or coalesces it with an existing one.
     *
     * When a job with the same `name` is already in the `delayed` state, its
     * delay timer is reset instead of creating a new job. Once the job has been
     * re-delayed `maxCountDelayed` times (per-call, or from `defaultMaxCountDelayed`
     * set in the constructor), it is promoted to run immediately.
     *
     * @param params - Job parameters (omit `internalQueue`). `maxCountDelayed`
     *   overrides the queue-level `defaultMaxCountDelayed` when provided.
     * @returns A `Response` containing the created or updated `Job` on success.
     */
    public addOrDelayJob(
        params: Omit<AddOrDelayJobParams<QueueMethods>, "internalQueue">,
    ): Promise<Response<Job<DelayedJobData<QueueMethods>>, SetJobErrorCode | GetJobErrorCode>> {
        const maxCountDelayed = params.maxCountDelayed ?? this.config.defaultMaxCountDelayed;
        return addOrDelayJob<QueueMethods>({ ...params, maxCountDelayed, internalQueue: this.internalQueue });
    }

    /**
     * Removes a job from the queue by its job ID.
     *
     * @param params - `{ jobId: string }`
     * @returns A `Response` containing `null` on success.
     */
    public removeJob(params: { jobId: string }): Promise<Response<null, RemoveJobErrorCode>> {
        return removeJob<QueueMethods>({ ...params, internalQueue: this.internalQueue });
    }

    /**
     * Promotes a delayed job to the waiting state so it runs immediately.
     *
     * @param params - `{ name: string }`
     * @returns A `Response` containing the job name (or `null` if not found).
     */
    public playJobNow(params: { name: string }): Promise<Response<string | null, GetJobNamesErrorCode>> {
        return playJobNow<QueueMethods>({ ...params, internalQueue: this.internalQueue });
    }

    // ---------------------------------------------------------------------------
    // Job querying
    // ---------------------------------------------------------------------------

    /**
     * Retrieves an existing job by name.
     *
     * @param params - `{ name: string }`
     * @returns A `Response` containing the `Job` (or `undefined` if not found).
     */
    public getExistingJob(
        params: { name: string },
    ): Promise<Response<Job<DelayedJobData<QueueMethods>> | undefined, GetJobErrorCode>> {
        return getExistingJob<QueueMethods>({ ...params, internalQueue: this.internalQueue });
    }

    /**
     * Retrieves the names of all jobs matching the given statuses and optional
     * name filter.
     *
     * @param params - Optional filter parameters (omit `internalQueue`).
     * @returns A `Response` containing an array of job name strings.
     */
    public getJobNames(
        params?: Omit<GetJobNamesProps<QueueMethods>, "internalQueue">,
    ): Promise<Response<string[], GetJobNamesErrorCode>> {
        return getJobNames<QueueMethods>({ ...params, internalQueue: this.internalQueue });
    }

    /**
     * Retrieves the names of all failed jobs in the queue.
     *
     * @param params - Optional `{ start?: number; length?: number }` for pagination.
     * @returns A `Response` containing an array of failed job name strings.
     */
    public getFailedJobs(
        params?: { start?: number; length?: number },
    ): Promise<Response<string[], GetJobNamesErrorCode>> {
        return getFailedJobs<QueueMethods>({ ...params, internalQueue: this.internalQueue });
    }

    /**
     * Retrieves full BullMQ `Job` objects matching the given statuses and
     * optional name filter.
     *
     * @param params - Optional filter parameters (omit `internalQueue`).
     * @returns A `Response` containing an array of `Job` objects.
     */
    public getJobs(
        params?: Omit<GetJobNamesProps<QueueMethods>, "internalQueue">,
    ): Promise<Response<Job<DelayedJobData<QueueMethods>, unknown, string>[], GetJobNamesErrorCode>> {
        return getJobs<QueueMethods>({ ...params, internalQueue: this.internalQueue });
    }

    /**
     * Retrieves specific jobs by name, returning a `{ jobName, job }` pair for
     * each requested name (job is `undefined` when not found).
     *
     * @param params - `{ names: string[] }` (omit `internalQueue`).
     * @returns A `Response` containing a {@link FetchJobsByNamesResult} array.
     */
    public fetchJobsByNames(
        params: Omit<FetchJobsByNamesProps<QueueMethods>, "internalQueue">,
    ): Promise<Response<FetchJobsByNamesResult<QueueMethods>, GetJobNamesErrorCode>> {
        return fetchJobsByNames<QueueMethods>({ ...params, internalQueue: this.internalQueue });
    }

    /**
     * Finds job names from the provided list that are not currently active,
     * delayed, or waiting in the queue.
     *
     * @param params - `{ names: string[] }` (omit `internalQueue`).
     * @returns A `Response` containing an array of missing job name strings.
     */
    public getMissingJobs(
        params: Omit<FetchJobsByNamesProps<QueueMethods>, "internalQueue">,
    ): Promise<Response<string[], GetJobNamesErrorCode>> {
        return getMissingJobs<QueueMethods>({ ...params, internalQueue: this.internalQueue });
    }

    /**
     * Counts the total number of jobs in the queue across the specified statuses.
     *
     * @param params - `{ statuses: JobStatus[] }`
     * @returns A `Response` containing the total job count.
     */
    public countJobs(params: { statuses: JobStatus[] }): Promise<Response<number, GetJobCountErrorCode>> {
        return countJobs({ bullQueue: this.internalQueue.queue, statuses: params.statuses });
    }

    /**
     * Performs a cursor-based Redis `SCAN` for keys matching a pattern.
     *
     * Requires a connected Redis client instance (e.g. from the `redis` package).
     * This is an optional dependency — if you don't use this method, you don't
     * need to install `redis`.
     *
     * @param params - {@link AsyncRedisScanParams}
     * @returns A `Response` containing an array of matching key strings.
     */
    public asyncRedisScan(
        params: AsyncRedisScanParams,
    ): Promise<Response<string[], AsyncRedisScanErrorCode>> {
        return asyncRedisScan(params);
    }
}
