import { describe, it, expect, vi, beforeEach } from "vitest";
import { addJob } from "../../operations/addJob.js";
import { InternalQueueState } from "../../types.js";

type TestMethods = {
    sendEmail: (params: { to: string }) => Promise<void>;
};

const makeMockInternalQueue = (overrides?: Partial<ReturnType<typeof makeMockQueue>>) => {
    const mockQueue = makeMockQueue(overrides);
    const internalQueue: InternalQueueState<TestMethods> = {
        queue: mockQueue as never,
        methods: {
            sendEmail: vi.fn().mockResolvedValue(undefined),
        },
    };
    return { internalQueue, mockQueue };
};

const makeMockQueue = (overrides?: object) => ({
    getJob: vi.fn(),
    add: vi.fn(),
    ...overrides,
});

const makePayload = () => ({ method: "sendEmail" as const, params: { to: "test@example.com" } });

beforeEach(() => {
    vi.clearAllMocks();
});

describe("addJob", () => {
    it("creates a new job successfully when no existing job is found", async () => {
        const { internalQueue, mockQueue } = makeMockInternalQueue();
        const createdJob = { id: "job-1", name: "email:user1" };

        mockQueue.getJob.mockResolvedValue(null);
        mockQueue.add.mockResolvedValue(createdJob);

        const result = await addJob<TestMethods>({
            internalQueue,
            name: "email:user1",
            payload: makePayload(),
            delayInSeconds: 10,
        });

        expect(result.hasFailed).toBe(false);
        if (!result.hasFailed) {
            expect(result.data).toEqual(createdJob);
        }
        expect(mockQueue.add).toHaveBeenCalledWith(
            "email:user1",
            expect.objectContaining({ countDelayed: 0, delayInSeconds: 10 }),
            expect.objectContaining({ delay: 10_000, jobId: "email:user1" }),
        );
    });

    it("removes an existing job in 'unknown' state before creating a new one", async () => {
        const { internalQueue, mockQueue } = makeMockInternalQueue();
        const existingJob = {
            getState: vi.fn().mockResolvedValue("unknown"),
            remove: vi.fn().mockResolvedValue(undefined),
        };
        const createdJob = { id: "job-2", name: "email:user2" };

        mockQueue.getJob.mockResolvedValue(existingJob);
        mockQueue.add.mockResolvedValue(createdJob);

        const result = await addJob<TestMethods>({
            internalQueue,
            name: "email:user2",
            payload: makePayload(),
            delayInSeconds: 5,
        });

        expect(existingJob.remove).toHaveBeenCalledOnce();
        expect(result.hasFailed).toBe(false);
    });

    it("removes an existing job in 'completed' state before creating a new one", async () => {
        const { internalQueue, mockQueue } = makeMockInternalQueue();
        const existingJob = {
            getState: vi.fn().mockResolvedValue("completed"),
            remove: vi.fn().mockResolvedValue(undefined),
        };

        mockQueue.getJob.mockResolvedValue(existingJob);
        mockQueue.add.mockResolvedValue({ id: "job-3", name: "email:user3" });

        await addJob<TestMethods>({
            internalQueue,
            name: "email:user3",
            payload: makePayload(),
            delayInSeconds: 5,
        });

        expect(existingJob.remove).toHaveBeenCalledOnce();
    });

    it("does NOT remove an existing job in 'active' state", async () => {
        const { internalQueue, mockQueue } = makeMockInternalQueue();
        const existingJob = {
            getState: vi.fn().mockResolvedValue("active"),
            remove: vi.fn(),
        };

        mockQueue.getJob.mockResolvedValue(existingJob);
        mockQueue.add.mockResolvedValue({ id: "job-4", name: "email:user4" });

        await addJob<TestMethods>({
            internalQueue,
            name: "email:user4",
            payload: makePayload(),
            delayInSeconds: 5,
        });

        expect(existingJob.remove).not.toHaveBeenCalled();
    });

    it("calls the onAddedJob callback after the job is created", async () => {
        const { internalQueue, mockQueue } = makeMockInternalQueue();
        const createdJob = { id: "job-5", name: "email:user5" };
        const onAddedJob = vi.fn();

        mockQueue.getJob.mockResolvedValue(null);
        mockQueue.add.mockResolvedValue(createdJob);

        await addJob<TestMethods>({
            internalQueue,
            name: "email:user5",
            payload: makePayload(),
            delayInSeconds: 5,
            onAddedJob,
        });

        expect(onAddedJob).toHaveBeenCalledWith(createdJob);
    });

    it("returns an error response when queue.add throws", async () => {
        const { internalQueue, mockQueue } = makeMockInternalQueue();

        mockQueue.getJob.mockResolvedValue(null);
        mockQueue.add.mockRejectedValue(new Error("Redis connection failed"));

        const result = await addJob<TestMethods>({
            internalQueue,
            name: "email:user6",
            payload: makePayload(),
            delayInSeconds: 5,
        });

        expect(result.hasFailed).toBe(true);
        if (result.hasFailed) {
            expect(result.error.code).toBe("error_while_create_queue_job");
        }
    });

    it("returns an error response when getJob throws", async () => {
        const { internalQueue, mockQueue } = makeMockInternalQueue();

        mockQueue.getJob.mockRejectedValue(new Error("Redis error"));

        const result = await addJob<TestMethods>({
            internalQueue,
            name: "email:user7",
            payload: makePayload(),
            delayInSeconds: 5,
        });

        expect(result.hasFailed).toBe(true);
        if (result.hasFailed) {
            expect(result.error.code).toBe("error_while_getting_queue_jobs");
        }
    });
});
