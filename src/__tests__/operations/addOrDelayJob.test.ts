import { describe, it, expect, vi, beforeEach } from "vitest";
import { addOrDelayJob } from "../../operations/addOrDelayJob.js";
import { InternalQueueState } from "../../types.js";

type TestMethods = {
    sendEmail: (params: { to: string }) => Promise<void>;
};

const makePayload = () => ({ method: "sendEmail" as const, params: { to: "test@example.com" } });

const makeMockInternalQueue = (queueOverrides?: object): { internalQueue: InternalQueueState<TestMethods>; mockQueue: ReturnType<typeof makeMockQueue> } => {
    const mockQueue = makeMockQueue(queueOverrides);
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

beforeEach(() => {
    vi.clearAllMocks();
});

describe("addOrDelayJob", () => {
    it("creates a new job when no existing job is found", async () => {
        const { internalQueue, mockQueue } = makeMockInternalQueue();
        const createdJob = { id: "job-1", name: "email:user1" };

        mockQueue.getJob.mockResolvedValue(null);
        mockQueue.add.mockResolvedValue(createdJob);

        const result = await addOrDelayJob<TestMethods>({
            internalQueue,
            name: "email:user1",
            payload: makePayload(),
            delayInSeconds: 10,
        });

        expect(result.hasFailed).toBe(false);
        if (!result.hasFailed) {
            expect(result.data).toEqual(createdJob);
        }
        expect(mockQueue.add).toHaveBeenCalledOnce();
    });

    it("delays (coalesces) an existing delayed job instead of creating a new one", async () => {
        const { internalQueue, mockQueue } = makeMockInternalQueue();
        const existingJob = {
            name: "email:user2",
            data: {
                method: "sendEmail",
                params: { to: "test@example.com" },
                countDelayed: 1,
                delayInSeconds: 10,
            },
            isDelayed: vi.fn().mockResolvedValue(true),
            changeDelay: vi.fn().mockResolvedValue(undefined),
            updateData: vi.fn().mockResolvedValue(undefined),
        };

        mockQueue.getJob.mockResolvedValue(existingJob);

        const result = await addOrDelayJob<TestMethods>({
            internalQueue,
            name: "email:user2",
            payload: makePayload(),
            delayInSeconds: 10,
        });

        expect(result.hasFailed).toBe(false);
        // Should have called changeDelay, not add
        expect(existingJob.changeDelay).toHaveBeenCalledOnce();
        expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it("creates a new job when existing job is active (not delayed)", async () => {
        const { internalQueue, mockQueue } = makeMockInternalQueue();
        const existingJob = {
            name: "email:user3",
            data: {
                method: "sendEmail",
                params: { to: "test@example.com" },
                countDelayed: 0,
                delayInSeconds: 10,
            },
            isDelayed: vi.fn().mockResolvedValue(false),
            getState: vi.fn().mockResolvedValue("active"),
        };
        const createdJob = { id: "job-3", name: "email:user3" };

        mockQueue.getJob.mockResolvedValue(existingJob);
        mockQueue.add.mockResolvedValue(createdJob);

        const result = await addOrDelayJob<TestMethods>({
            internalQueue,
            name: "email:user3",
            payload: makePayload(),
            delayInSeconds: 10,
        });

        expect(result.hasFailed).toBe(false);
        expect(mockQueue.add).toHaveBeenCalledOnce();
    });

    it("returns an error when getExistingJob fails", async () => {
        const { internalQueue, mockQueue } = makeMockInternalQueue();

        mockQueue.getJob.mockRejectedValue(new Error("Redis unavailable"));

        const result = await addOrDelayJob<TestMethods>({
            internalQueue,
            name: "email:user4",
            payload: makePayload(),
            delayInSeconds: 10,
        });

        expect(result.hasFailed).toBe(true);
        if (result.hasFailed) {
            expect(result.error.code).toBe("error_while_getting_queue_jobs");
        }
    });

    it("removes an existing 'completed' job before creating a new one", async () => {
        const { internalQueue, mockQueue } = makeMockInternalQueue();
        const existingJob = {
            name: "email:user5",
            data: { method: "sendEmail", params: {}, countDelayed: 0, delayInSeconds: 5 },
            isDelayed: vi.fn().mockResolvedValue(false),
            getState: vi.fn().mockResolvedValue("completed"),
            remove: vi.fn().mockResolvedValue(undefined),
        };

        mockQueue.getJob.mockResolvedValue(existingJob);
        mockQueue.add.mockResolvedValue({ id: "job-5" });

        await addOrDelayJob<TestMethods>({
            internalQueue,
            name: "email:user5",
            payload: makePayload(),
            delayInSeconds: 10,
        });

        expect(existingJob.remove).toHaveBeenCalledOnce();
        expect(mockQueue.add).toHaveBeenCalledOnce();
    });

    it("calls onAddedJob when a new job is created", async () => {
        const { internalQueue, mockQueue } = makeMockInternalQueue();
        const createdJob = { id: "job-6", name: "email:user6" };
        const onAddedJob = vi.fn();

        mockQueue.getJob.mockResolvedValue(null);
        mockQueue.add.mockResolvedValue(createdJob);

        await addOrDelayJob<TestMethods>({
            internalQueue,
            name: "email:user6",
            payload: makePayload(),
            delayInSeconds: 10,
            onAddedJob,
        });

        expect(onAddedJob).toHaveBeenCalledWith(createdJob);
    });
});
