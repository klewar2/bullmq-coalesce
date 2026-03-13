# bullmq-coalesce

A BullMQ wrapper that implements **coalesced (debounced) job execution**. When you schedule a job that already exists in a delayed state, instead of creating a duplicate it resets the delay timer — a classic debounce pattern for job queues.

## Install

```bash
# npm
npm install bullmq-coalesce bullmq

# pnpm
pnpm add bullmq-coalesce bullmq

# yarn
yarn add bullmq-coalesce bullmq
```

If you plan to use `asyncRedisScan`, also install the optional Redis client:

```bash
# npm
npm install redis

# pnpm
pnpm add redis

# yarn
yarn add redis
```

## Quick Start

```typescript
import { CoalescedQueue } from "bullmq-coalesce";

// 1. Define your queue's methods as a TypeScript type.
type MyMethods = {
  sendWelcomeEmail: (params: { userId: string; email: string }) => Promise<void>;
  generateReport: (params: { reportId: string }) => Promise<void>;
};

// 2. Implement the methods — these run inside the BullMQ worker.
const methods: MyMethods = {
  sendWelcomeEmail: async ({ userId, email }) => {
    console.log(`Sending welcome email to ${email} for user ${userId}`);
  },
  generateReport: async ({ reportId }) => {
    console.log(`Generating report ${reportId}`);
  },
};

// 3. Create the queue.
const queue = new CoalescedQueue<MyMethods>({
  name: "my-queue",
  redisUrl: "redis://localhost:6379",
  methods,
  onHandleError: (err) => console.error("Worker error:", err),
  onHandleSuccess: (job) => console.log("Job completed:", job.name),
});

// 4. Start the worker.
await queue.start();

// 5. Add a debounced job — scheduling the same name twice resets the timer,
//    not create two separate jobs.
await queue.addOrDelayJob({
  name: `send-email:user-${userId}`,
  payload: { method: "sendWelcomeEmail", params: { userId, email: "user@example.com" } },
  delayInSeconds: 30,
});

// Later, calling addOrDelayJob again for the same name resets the 30-second timer.
await queue.addOrDelayJob({
  name: `send-email:user-${userId}`,
  payload: { method: "sendWelcomeEmail", params: { userId, email: "user@example.com" } },
  delayInSeconds: 30,
});

// Graceful shutdown.
await queue.stop();
```

## How Coalescing Works

1. **First call** — No job with that name exists. A new delayed job is created.
2. **Second call (job is still delayed)** — The existing job's delay timer is reset. `countDelayed` is incremented. No new job is created.
3. **`maxCountDelayed` threshold** — If `countDelayed` reaches `maxCountDelayed`, the job is promoted to run immediately instead of being delayed again.
4. **Job completes or fails** — The next call creates a fresh job.

This prevents a flood of identical updates from each triggering a separate expensive operation (e.g. sending emails, regenerating reports, syncing data).

## Use Cases

### 1. Debouncing user-triggered actions

A user edits their profile repeatedly. You only want to sync to an external CRM once they stop typing, not on every keystroke.

```typescript
type CRMMethods = {
  syncContact: (params: { userId: string; data: Record<string, string> }) => Promise<void>;
};

const queue = new CoalescedQueue<CRMMethods>({
  name: "crm-sync",
  redisUrl: process.env.REDIS_URL,
  methods: {
    syncContact: async ({ userId, data }) => {
      await crmClient.upsertContact(userId, data);
    },
  },
});

await queue.start();

// Called on every profile update event — only the last one within 10 seconds fires.
async function onProfileUpdated(userId: string, data: Record<string, string>) {
  await queue.addOrDelayJob({
    name: `sync-contact:${userId}`,
    payload: { method: "syncContact", params: { userId, data } },
    delayInSeconds: 10,
  });
}
```

---

### 2. Capping the number of delays with `maxCountDelayed`

A user keeps updating a document. You want to debounce saves, but guarantee the job runs at most after 5 delays — regardless of how active the user is.

```typescript
type SaveMethods = {
  saveDocument: (params: { docId: string; content: string }) => Promise<void>;
};

const queue = new CoalescedQueue<SaveMethods>({
  name: "document-saves",
  redisUrl: process.env.REDIS_URL,
  methods: {
    saveDocument: async ({ docId, content }) => {
      await db.documents.update({ id: docId }, { content });
    },
  },
  // Queue-level default: after 5 re-delays, the job runs immediately.
  defaultMaxCountDelayed: 5,
});

await queue.start();

async function onDocumentChanged(docId: string, content: string) {
  await queue.addOrDelayJob({
    name: `save-doc:${docId}`,
    payload: { method: "saveDocument", params: { docId, content } },
    delayInSeconds: 5,
    // Per-call override (takes priority over defaultMaxCountDelayed):
    // maxCountDelayed: 3,
  });
}
```

---

### 3. Sending a single notification after multiple events

Multiple microservices emit events for the same order (payment confirmed, stock reserved, shipping queued). You want to send only one "order ready" email after all events settle.

```typescript
type NotificationMethods = {
  sendOrderReadyEmail: (params: { orderId: string; email: string }) => Promise<void>;
};

const queue = new CoalescedQueue<NotificationMethods>({
  name: "notifications",
  redisUrl: process.env.REDIS_URL,
  methods: {
    sendOrderReadyEmail: async ({ orderId, email }) => {
      await mailer.send({ to: email, subject: `Order ${orderId} is ready!` });
    },
  },
});

await queue.start();

// Each microservice calls this — only the last one within 15 seconds fires.
async function onOrderEvent(orderId: string, email: string) {
  await queue.addOrDelayJob({
    name: `order-ready:${orderId}`,
    payload: { method: "sendOrderReadyEmail", params: { orderId, email } },
    delayInSeconds: 15,
  });
}
```

---

### 4. Forcing a job to run immediately with `addJob`

When you want to schedule a delayed job without any coalescing — for instance a one-off scheduled task that must always run, even if a job with the same name already exists in a completed or failed state.

```typescript
type ReportMethods = {
  generateMonthlyReport: (params: { month: string }) => Promise<void>;
};

const queue = new CoalescedQueue<ReportMethods>({
  name: "reports",
  redisUrl: process.env.REDIS_URL,
  methods: {
    generateMonthlyReport: async ({ month }) => {
      await reportService.generate(month);
    },
  },
});

await queue.start();

// Schedules a fresh job in 1 hour, replacing any stale previous attempt.
await queue.addJob({
  name: "monthly-report:2024-03",
  payload: { method: "generateMonthlyReport", params: { month: "2024-03" } },
  delayInSeconds: 3600,
  onAddedJob: (job) => console.log(`Job ${job.name} scheduled.`),
});
```

---

### 5. Guard with `onBeforeExecuteJob` (rate limiting, feature flags)

Abort or re-queue a job at execution time based on runtime conditions — for example a rate limiter or a feature flag.

```typescript
import { CoalescedQueue, JobStatus } from "bullmq-coalesce";

type ApiMethods = {
  callExternalApi: (params: { endpoint: string }) => Promise<void>;
};

const queue = new CoalescedQueue<ApiMethods>({
  name: "api-calls",
  redisUrl: process.env.REDIS_URL,
  methods: {
    callExternalApi: async ({ endpoint }) => {
      await fetch(endpoint);
    },
  },
  onBeforeExecuteJob: async (job) => {
    const allowed = await rateLimiter.check(job.data.method);
    if (!allowed) {
      // retry: true tells the worker to re-queue this job.
      return { hasFailed: true, error: { code: "rate_limit" }, retry: true };
    }
    return { hasFailed: false, data: undefined };
  },
});
```

---

### 6. Promoting a job to run right now

A user clicks "send now" in the UI, bypassing the remaining delay.

```typescript
async function onSendNow(jobName: string) {
  const result = await queue.playJobNow({ name: jobName });

  if (result.hasFailed) {
    console.error("Could not promote job:", result.error);
    return;
  }

  console.log(result.data ? `Job ${result.data} will run now.` : "Job not found.");
}
```

---

### 7. Inspecting the queue

```typescript
import { JobStatus } from "bullmq-coalesce";

// Count how many jobs are currently delayed.
const countResult = await queue.countJobs({ statuses: [JobStatus.DELAYED] });
if (!countResult.hasFailed) {
  console.log(`${countResult.data} jobs are delayed.`);
}

// Get all job names currently active or waiting.
const namesResult = await queue.getJobNames({
  jobStatuses: [JobStatus.ACTIVE, JobStatus.WAIT],
});
if (!namesResult.hasFailed) {
  console.log("Running jobs:", namesResult.data);
}

// Check which of a known set of jobs are missing (not active/delayed/waiting).
const missingResult = await queue.getMissingJobs({
  names: ["job:user-1", "job:user-2", "job:user-3"],
});
if (!missingResult.hasFailed) {
  console.log("Jobs to reschedule:", missingResult.data);
}
```

---

### 8. Targeted lookup for a known set of jobs

When you already know the names, use `fetchJobsByNames` instead of scanning the entire queue — it performs one Redis call per name in parallel.

```typescript
const result = await queue.fetchJobsByNames({
  names: ["sync-contact:user-1", "sync-contact:user-2", "sync-contact:user-3"],
});

if (!result.hasFailed) {
  for (const { jobName, job } of result.data) {
    if (job) {
      const state = await job.getState();
      console.log(`${jobName} → ${state}`);
    } else {
      console.log(`${jobName} → not found`);
    }
  }
}
```

---

### 9. Handling failed jobs

```typescript
const queue = new CoalescedQueue<MyMethods>({
  name: "my-queue",
  redisUrl: process.env.REDIS_URL,
  methods,
  onFailedJob: (job, error) => {
    console.error(`Job ${job.name} failed:`, error.message);
    // Send to your error tracking service, e.g. Sentry:
    // Sentry.captureException(error, { extra: { jobName: job.name } });
  },
});

// List all failed jobs.
const failedResult = await queue.getFailedJobs();
if (!failedResult.hasFailed) {
  console.log("Failed jobs:", failedResult.data);
}
```

---

### 10. Removing a pending job

Cancel a scheduled job before it runs — for example when a user deletes their account.

```typescript
async function onUserDeleted(userId: string) {
  const result = await queue.removeJob({ jobId: `sync-contact:${userId}` });

  if (result.hasFailed) {
    console.error("Could not remove job:", result.error.message);
  }
}
```

---

### 11. Graceful shutdown (NestJS / Express example)

```typescript
// NestJS lifecycle hook
async onApplicationShutdown() {
  await queue.stop();
}

// Express / Node process signals
process.on("SIGTERM", async () => {
  await queue.stop();
  process.exit(0);
});
```

---

### 12. Handling errors with typed error codes

Every method returns a `Response` discriminated union. Use the exported constants to handle specific failure reasons.

```typescript
import { CoalescedQueue, SET_JOB_ERROR_CODE, GET_JOB_ERROR_CODE } from "bullmq-coalesce";

const result = await queue.addOrDelayJob({
  name: "my-job",
  payload: { method: "sendWelcomeEmail", params: { userId: "1", email: "a@b.com" } },
  delayInSeconds: 10,
});

if (result.hasFailed) {
  switch (result.error.code) {
    case SET_JOB_ERROR_CODE.ERROR_WHILE_CREATE_QUEUE_JOB:
      console.error("Redis rejected the job creation:", result.error.message);
      break;
    case GET_JOB_ERROR_CODE.ERROR_WHILE_GETTING_QUEUE_JOBS:
      console.error("Could not look up existing job:", result.error.message);
      break;
    default:
      console.error("Unexpected error:", result.error);
  }
}
```

## API

### `new CoalescedQueue<QueueMethods>(params)`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | BullMQ queue name (must be unique per Redis instance) |
| `redisUrl` | `string` | Yes | Full Redis URL, e.g. `redis://localhost:6379` or `rediss://...` for TLS |
| `methods` | `QueueMethods` | Yes | Async handler functions keyed by method name |
| `onStopError` | `(error: OnStopError) => void` | No | Called when `stop()` fails to shut down cleanly |
| `onHandleError` | `(error: Error) => void` | No | Called when the worker throws an unexpected error |
| `onHandleSuccess` | `(job) => void` | No | Called after a job finishes successfully |
| `onBeforeExecuteJob` | `async (job) => Response` | No | Guard called before each job; return `{ hasFailed: true, retry: true }` to re-queue |
| `onExecuteJob` | `(job) => void` | No | Called immediately after the method executes |
| `onJobCompleted` | `(params) => void` | No | Called on BullMQ `"completed"` event (only for valid coalesced jobs) |
| `onErrorJob` | `(error: Error) => void` | No | Called on BullMQ worker `"error"` event |
| `onFailedJob` | `(job, error) => void` | No | Called on BullMQ worker `"failed"` event |
| `defaultMaxCountDelayed` | `number` | No | Default max re-delays before a job is promoted to run immediately (can be overridden per call) |
| `concurrency` | `number` | No | Number of jobs processed concurrently (default: BullMQ default) |
| `lockDuration` | `number` | No | Job lock duration in milliseconds |

### Instance Properties

| Property | Type | Description |
|---|---|---|
| `queue` | `Queue<DelayedJobData<QueueMethods>>` | The underlying BullMQ Queue |
| `worker` | `Worker` | The underlying BullMQ Worker |

### Methods

#### Lifecycle

| Method | Signature | Description |
|---|---|---|
| `start()` | `() => Promise<void>` | Starts the worker loop |
| `stop()` | `() => Promise<void>` | Gracefully shuts down queue and worker |

#### Job Scheduling

| Method | Description |
|---|---|
| `addJob(params)` | Adds a new delayed job. Removes stale terminal-state jobs first. |
| `addOrDelayJob(params)` | Adds or coalesces (debounces) a delayed job. |

`addOrDelayJob` accepts the same parameters as `addJob`, plus:
- `maxCountDelayed?: number` — Promote instead of delay once this count is reached. Overrides `defaultMaxCountDelayed` set in the constructor.
- `onDelayedJob?: (job) => void` — Callback when an existing job is coalesced.

#### Job Querying

| Method | Description |
|---|---|
| `getExistingJob({ name })` | Fetch a job by name. Returns `undefined` if not found. |
| `getJobNames(params?)` | Get names of jobs matching statuses and optional name filter. |
| `getJobs(params?)` | Get full Job objects matching statuses and optional name filter. |
| `fetchJobsByNames({ names })` | Fetch `{ jobName, job }` pairs for a specific list of names (parallel targeted lookup). |
| `getMissingJobs({ names })` | Find names from the list that are not active/delayed/waiting. |
| `getFailedJobs(params?)` | Get names of all failed jobs. |
| `countJobs({ statuses })` | Count jobs matching the given statuses. |
| `playJobNow({ name })` | Promote a delayed job to run immediately. |
| `removeJob({ jobId })` | Remove a job from the queue. |
| `asyncRedisScan(params)` | Cursor-based Redis key scan (requires `redis` package). |

All methods return `Response<Data, ErrorCode>`:
```typescript
type Response<Data, ErrorCode extends string> =
  | { hasFailed: false; data: Data }
  | { hasFailed: true; error: { code: ErrorCode; message?: string }; retry?: boolean };
```

## Error Codes

All error code constants are exported for use in your error handlers:

```typescript
import {
  STOP_QUEUE_ERROR_CODE,
  REMOVE_JOB_ERROR_CODE,
  GET_JOB_NAMES_ERROR_CODE,
  GET_JOB_COUNT_ERROR_CODE,
  GET_JOB_ERROR_CODE,
  SET_JOB_ERROR_CODE,
  RETURN_VALUE_REASON_CODE,
  ASYNC_REDIS_SCAN_ERROR_CODE,
} from "bullmq-coalesce";
```

## Contributing

1. Clone the repo.
2. Install dependencies: `npm install`
3. Run tests: `npm test`
4. Build: `npm run build`

Pull requests are welcome. Please open an issue first for significant changes.

## License

MIT
