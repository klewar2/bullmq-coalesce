/**
 * Public API for `bullmq-coalesce`.
 *
 * Import the main class and any supporting types/constants you need:
 *
 * @example
 * ```typescript
 * import { CoalescedQueue } from "bullmq-coalesce";
 * ```
 */

export { CoalescedQueue } from "./CoalescedQueue.js";

// All TypeScript types and enums
export type {
    BaseDelayedQueueMethods,
    BaseQueueMethods,
    AddJobParams,
    AddOrDelayJobParams,
    AsyncRedisScanErrorCode,
    CoalescedQueueParams,
    CountJobsProps,
    DelayedJobData,
    DelayedMethodsAndDataType,
    EnumType,
    ErrorType,
    GetFailedJobsProps,
    GetJobCountErrorCode,
    GetJobErrorCode,
    GetJobNamesErrorCode,
    GetJobNamesProps,
    FetchJobsByNamesProps,
    FetchJobsByNamesResult,
    InternalQueueState,
    Method,
    OnStopError,
    PlayJobNowProps,
    QueueMethodParams,
    RemoveJobErrorCode,
    RemoveJobProps,
    Response,
    ReturnValueErrorCode,
    SetJobErrorCode,
    StopErrorCode,
} from "./types.js";

export { JobStatus } from "./types.js";

// Error code constants
export {
    ASYNC_REDIS_SCAN_ERROR_CODE,
    GET_JOB_COUNT_ERROR_CODE,
    GET_JOB_ERROR_CODE,
    GET_JOB_NAMES_ERROR_CODE,
    REMOVE_JOB_ERROR_CODE,
    RETURN_VALUE_REASON_CODE,
    SET_JOB_ERROR_CODE,
    STOP_QUEUE_ERROR_CODE,
} from "./constants.js";

// Type guard helpers
export { isDelayedJobType, isJobNeedToBeRetried, isReturnValueType } from "./helpers.js";

// asyncRedisScan is also available as a standalone function
export { asyncRedisScan } from "./operations/asyncRedisScan.js";
export type { AsyncRedisScanParams, RedisClientLike } from "./operations/asyncRedisScan.js";
