import { Job, Queue, RedisOptions, Worker } from "bullmq";
import { RETURN_VALUE_REASON_CODE } from "../constants.js";
import { BaseDelayedQueueMethods, DelayedJobData, InternalQueueState, ReturnValueErrorCode } from "../types.js";
import { BaseQueueMethods, Response } from "../utils/types.js";
import { buildToggleQueueState } from "../utils/toggleQueueState.js";
import { handleJob } from "./handleJob.js";

/**
 * Parameters for {@link createWorker}.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export interface CreateWorkerParams<QueueMethods extends BaseQueueMethods> {
    /** The BullMQ queue name. */
    name: string;
    /** Redis connection options. */
    connection: RedisOptions;
    /** The registered method handlers keyed by method name. */
    methods: BaseDelayedQueueMethods;
    /**
     * Optional async guard called before each job is executed.
     * Return `{ hasFailed: true }` to abort execution.
     */
    onBeforeExecuteJob?: (job: Job<DelayedJobData<QueueMethods>>) => Promise<Response<undefined, ReturnValueErrorCode>>;
    /** Called immediately after a job method returns successfully. */
    onExecuteJob?: (job: Job<DelayedJobData<QueueMethods>>) => void;
    /** Called after a job is fully processed without error. */
    onHandleSuccess?: (job: Job<DelayedJobData<QueueMethods>>) => void;
    /** Called when the worker processor throws an unexpected error. */
    onHandleError?: (error: Error) => void;
    /** Called when the BullMQ worker emits the `"failed"` event. */
    onFailedJob?: (job: Job<DelayedJobData<QueueMethods>>, error: Error) => void;
    /** Number of jobs the worker processes concurrently. */
    concurrency?: number;
    /** Duration (ms) after which a job lock expires. */
    lockDuration?: number;
}

/**
 * The value returned by {@link createWorker}.
 *
 * @typeParam QueueMethods - A {@link BaseQueueMethods} map.
 */
export interface CreateWorkerResult<QueueMethods extends BaseQueueMethods> {
    /** The internal queue state used by operation functions. */
    internalQueue: InternalQueueState<QueueMethods>;
    /** The BullMQ `Worker` instance. */
    worker: Worker;
    /**
     * Starts the worker loop and resumes both the queue and the worker.
     * Safe to call multiple times — only calls `worker.run()` when the worker
     * is not already running.
     */
    start: () => Promise<void>;
}

/**
 * Creates a BullMQ `Queue` and `Worker` pair wired up to the `handleJob`
 * processor, and returns an {@link InternalQueueState} along with lifecycle
 * helpers.
 *
 * The worker is created with `autorun: false` so that `start()` must be called
 * explicitly before it begins processing jobs.
 *
 * @param params - {@link CreateWorkerParams}
 * @returns {@link CreateWorkerResult}
 */
export const createWorker = <QueueMethods extends BaseQueueMethods>(
    params: CreateWorkerParams<QueueMethods>,
): CreateWorkerResult<QueueMethods> => {
    const { name, connection, methods, onBeforeExecuteJob, onExecuteJob, onHandleError, onHandleSuccess, onFailedJob, concurrency, lockDuration } =
        params;

    const queue = new Queue<DelayedJobData<QueueMethods>, unknown, string>(name, { connection });

    const internalQueue: InternalQueueState<QueueMethods> = { queue, methods };

    const worker = new Worker<DelayedJobData<QueueMethods>, unknown, string>(
        name,
        async (job) => {
            try {
                const response = await handleJob<QueueMethods>({ job, internalQueue, onBeforeExecuteJob, onExecuteJob });

                if (!response.hasFailed) {
                    onHandleSuccess?.(job);
                } else if (!response.retry && typeof onFailedJob === "function") {
                    onFailedJob(job, new Error(response.error.message));
                }

                return response;
            } catch (e) {
                if (e instanceof Error) onHandleError?.(e);
                return {
                    hasFailed: true,
                    error: { code: RETURN_VALUE_REASON_CODE.OTHER },
                };
            }
        },
        { connection, concurrency, lockDuration, autorun: false },
    );

    const toggleState = buildToggleQueueState({ queue, worker });

    const start = async (): Promise<void> => {
        if (!worker.isRunning()) {
            worker.run();
        }
        await toggleState("resume");
    };

    return { internalQueue, worker, start };
};
