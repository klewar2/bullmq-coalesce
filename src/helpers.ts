import { Job } from "bullmq";
import { BaseDelayedQueueMethods, DelayedJobData, ReturnValueErrorCode } from "./types.js";
import { BaseQueueMethods, Response } from "./utils/types.js";
import { isObject } from "./utils/isObject.js";

/**
 * Type guard that narrows a generic BullMQ `Job` to a
 * `Job<DelayedJobData<QueueMethods>>` by verifying the job's data shape.
 *
 * A job is considered a valid "delayed job type" when its data:
 * - is a plain object
 * - contains a `"method"` key whose value is a registered method name
 * - contains a `"params"` key
 *
 * @param job     - The BullMQ job to inspect.
 * @param methods - The map of registered queue methods used to validate the
 *   `method` field.
 * @returns `true` when the job's data matches the {@link DelayedJobData} shape.
 */
export const isDelayedJobType = <QueueMethods extends BaseQueueMethods>(
    job: Job,
    methods: BaseDelayedQueueMethods,
): job is Job<DelayedJobData<QueueMethods>> => {
    const { data } = job;
    return (
        isObject(data) &&
        "method" in data &&
        typeof data.method === "string" &&
        Object.keys(methods).includes(data.method) &&
        "params" in data
    );
};

/**
 * Type guard that checks whether a value is a {@link Response} discriminated
 * union (i.e. has a `hasFailed` boolean property).
 *
 * @param returnValue - The value to inspect (typically the return value of a
 *   job handler).
 * @returns `true` when `returnValue` looks like a `Response` object.
 */
export const isReturnValueType = (returnValue: unknown): returnValue is Response<undefined, ReturnValueErrorCode> => {
    return isObject(returnValue) && "hasFailed" in returnValue;
};

/**
 * Returns `true` when a job handler return value indicates the job should be
 * retried (i.e. `hasFailed: true` and `retry: true`).
 *
 * @param returnValue - The value returned by a job handler.
 * @returns A boolean indicating whether the job should be retried.
 */
export const isJobNeedToBeRetried = (returnValue: unknown): boolean => {
    return Boolean(isReturnValueType(returnValue) && returnValue.hasFailed && returnValue.retry);
};
