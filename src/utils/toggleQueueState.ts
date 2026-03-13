import { Queue, Worker } from "bullmq";

/**
 * Creates a function that pauses or resumes both a BullMQ `Queue` and a `Worker`
 * in a single call.
 *
 * @param params - An object containing the `queue` and `worker` to control.
 * @returns An async function that accepts `"pause"` or `"resume"` and applies
 *   the corresponding state change to both the queue and the worker.
 *
 * @example
 * const toggle = buildToggleQueueState({ queue, worker });
 * await toggle("pause");  // pauses both
 * await toggle("resume"); // resumes both
 */
export const buildToggleQueueState = (params: { queue: Queue; worker: Worker }) => {
    const { queue, worker } = params;

    /**
     * Pauses or resumes the queue and worker.
     *
     * @param state - `"pause"` to pause both queue and worker, `"resume"` to resume both.
     */
    return async (state: "resume" | "pause"): Promise<void> => {
        if (state === "pause") {
            await queue.pause();
            await worker.pause();
        } else {
            await queue.resume();
            worker.resume();
        }
    };
};
