import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoalescedQueue } from "../CoalescedQueue.js";

// ---------------------------------------------------------------------------
// Mock bullmq
// ---------------------------------------------------------------------------

const mockWorkerOn = vi.fn();
const mockWorkerRun = vi.fn();
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerPause = vi.fn().mockResolvedValue(undefined);
const mockWorkerResume = vi.fn();
const mockWorkerIsRunning = vi.fn().mockReturnValue(false);

const mockQueueAdd = vi.fn();
const mockQueueGetJob = vi.fn();
const mockQueuePause = vi.fn().mockResolvedValue(undefined);
const mockQueueResume = vi.fn().mockResolvedValue(undefined);
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockQueueGetJobCounts = vi.fn().mockResolvedValue({ wait: 0, delayed: 0, active: 0 });
const mockQueueGetFailedCount = vi.fn().mockResolvedValue(0);

vi.mock("bullmq", () => {
    const Queue = vi.fn().mockImplementation(() => ({
        add: mockQueueAdd,
        getJob: mockQueueGetJob,
        pause: mockQueuePause,
        resume: mockQueueResume,
        close: mockQueueClose,
        getJobCounts: mockQueueGetJobCounts,
        getFailedCount: mockQueueGetFailedCount,
        getJobs: vi.fn().mockResolvedValue([]),
        getFailed: vi.fn().mockResolvedValue([]),
        remove: vi.fn().mockResolvedValue(undefined),
    }));

    const Worker = vi.fn().mockImplementation(() => ({
        on: mockWorkerOn,
        run: mockWorkerRun,
        close: mockWorkerClose,
        pause: mockWorkerPause,
        resume: mockWorkerResume,
        isRunning: mockWorkerIsRunning,
    }));

    return { Queue, Worker };
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type TestMethods = {
    sendEmail: (params: { to: string }) => Promise<void>;
};

const createTestQueue = (overrides?: Partial<ConstructorParameters<typeof CoalescedQueue<TestMethods>>[0]>) => {
    return new CoalescedQueue<TestMethods>({
        name: "test-queue",
        redisUrl: "redis://localhost:6379",
        methods: {
            sendEmail: vi.fn().mockResolvedValue(undefined),
        },
        ...overrides,
    });
};

const makePayload = () => ({ method: "sendEmail" as const, params: { to: "user@example.com" } });

beforeEach(() => {
    vi.clearAllMocks();
    mockWorkerIsRunning.mockReturnValue(false);
    mockQueueAdd.mockResolvedValue({ id: "job-1", name: "email:user" });
    mockQueueGetJob.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CoalescedQueue constructor", () => {
    it("creates a queue instance with the correct name", async () => {
        const { Queue } = await import("bullmq");
        createTestQueue();
        expect(Queue).toHaveBeenCalledWith("test-queue", expect.any(Object));
    });

    it("creates a worker instance with the correct name", async () => {
        const { Worker } = await import("bullmq");
        createTestQueue();
        expect(Worker).toHaveBeenCalledWith("test-queue", expect.any(Function), expect.any(Object));
    });

    it("attaches error, failed, and completed listeners to the worker", () => {
        createTestQueue();
        const eventNames = mockWorkerOn.mock.calls.map(([event]: [string]) => event);
        expect(eventNames).toContain("error");
        expect(eventNames).toContain("failed");
        expect(eventNames).toContain("completed");
    });

    it("exposes queue and worker as public properties", async () => {
        const queue = createTestQueue();
        expect(queue.queue).toBeDefined();
        expect(queue.worker).toBeDefined();
    });
});

describe("CoalescedQueue.start()", () => {
    it("calls worker.run() when the worker is not running", async () => {
        mockWorkerIsRunning.mockReturnValue(false);
        const queue = createTestQueue();
        await queue.start();
        expect(mockWorkerRun).toHaveBeenCalledOnce();
    });

    it("does not call worker.run() when the worker is already running", async () => {
        mockWorkerIsRunning.mockReturnValue(true);
        const queue = createTestQueue();
        await queue.start();
        expect(mockWorkerRun).not.toHaveBeenCalled();
    });

    it("calls queue.resume() and worker.resume() after starting", async () => {
        const queue = createTestQueue();
        await queue.start();
        expect(mockQueueResume).toHaveBeenCalledOnce();
        expect(mockWorkerResume).toHaveBeenCalledOnce();
    });
});

describe("CoalescedQueue.stop()", () => {
    it("pauses and closes the queue then closes the worker", async () => {
        const queue = createTestQueue();
        await queue.stop();
        expect(mockQueuePause).toHaveBeenCalledOnce();
        expect(mockQueueClose).toHaveBeenCalledOnce();
        expect(mockWorkerClose).toHaveBeenCalledOnce();
    });

    it("calls onStopError when queue.close throws", async () => {
        mockQueueClose.mockRejectedValueOnce(new Error("close failed"));
        const onStopError = vi.fn();
        const queue = createTestQueue({ onStopError });

        await queue.stop();

        expect(onStopError).toHaveBeenCalledOnce();
        expect(onStopError).toHaveBeenCalledWith(
            expect.objectContaining({ code: "error_while_closing_queue" }),
        );
    });
});

describe("CoalescedQueue.addJob()", () => {
    it("delegates to the addJob operation and returns the created job", async () => {
        const createdJob = { id: "job-abc", name: "email:user" };
        mockQueueAdd.mockResolvedValue(createdJob);

        const queue = createTestQueue();
        const result = await queue.addJob({
            name: "email:user",
            payload: makePayload(),
            delayInSeconds: 30,
        });

        expect(result.hasFailed).toBe(false);
        if (!result.hasFailed) {
            expect(result.data).toEqual(createdJob);
        }
        expect(mockQueueAdd).toHaveBeenCalledWith(
            "email:user",
            expect.objectContaining({ countDelayed: 0, delayInSeconds: 30 }),
            expect.any(Object),
        );
    });
});

describe("CoalescedQueue.addOrDelayJob()", () => {
    it("delegates to the addOrDelayJob operation and creates a new job when none exists", async () => {
        const createdJob = { id: "job-xyz", name: "email:user" };
        mockQueueAdd.mockResolvedValue(createdJob);
        mockQueueGetJob.mockResolvedValue(null);

        const queue = createTestQueue();
        const result = await queue.addOrDelayJob({
            name: "email:user",
            payload: makePayload(),
            delayInSeconds: 30,
        });

        expect(result.hasFailed).toBe(false);
        if (!result.hasFailed) {
            expect(result.data).toEqual(createdJob);
        }
    });

    it("delays an existing job instead of creating a new one", async () => {
        const existingJob = {
            name: "email:user",
            data: { method: "sendEmail", params: { to: "user@example.com" }, countDelayed: 0, delayInSeconds: 30 },
            isDelayed: vi.fn().mockResolvedValue(true),
            changeDelay: vi.fn().mockResolvedValue(undefined),
            updateData: vi.fn().mockResolvedValue(undefined),
        };

        mockQueueGetJob.mockResolvedValue(existingJob);

        const queue = createTestQueue();
        const result = await queue.addOrDelayJob({
            name: "email:user",
            payload: makePayload(),
            delayInSeconds: 30,
        });

        expect(result.hasFailed).toBe(false);
        expect(existingJob.changeDelay).toHaveBeenCalledOnce();
        expect(mockQueueAdd).not.toHaveBeenCalled();
    });
});

describe("CoalescedQueue.countJobs()", () => {
    it("returns the sum of job counts across given statuses", async () => {
        mockQueueGetJobCounts.mockResolvedValue({ wait: 2, delayed: 5, active: 1 });
        const queue = createTestQueue();

        const result = await queue.countJobs({ statuses: ["wait" as never, "delayed" as never, "active" as never] });

        expect(result.hasFailed).toBe(false);
        if (!result.hasFailed) {
            expect(result.data).toBe(8);
        }
    });
});
