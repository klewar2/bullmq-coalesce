import { describe, it, expect, vi, beforeEach } from "vitest";
import { delayJob } from "../../operations/delayJob.js";
import { DelayedJobData } from "../../types.js";

type TestMethods = {
    sendEmail: (params: { to: string }) => Promise<void>;
};

const makePayload = () => ({ method: "sendEmail" as const, params: { to: "test@example.com" } });

const makeMockJob = (countDelayed = 0, overrides?: object) => ({
    name: "email:user1",
    data: {
        method: "sendEmail",
        params: { to: "test@example.com" },
        countDelayed,
        delayInSeconds: 10,
    } as DelayedJobData<TestMethods>,
    changeDelay: vi.fn().mockResolvedValue(undefined),
    updateData: vi.fn().mockResolvedValue(undefined),
    promote: vi.fn().mockResolvedValue(undefined),
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe("delayJob", () => {
    it("increments countDelayed and updates the job delay", async () => {
        const job = makeMockJob(0);

        const result = await delayJob<TestMethods>({
            job: job as never,
            newPayload: makePayload(),
            newDelayInSeconds: 15,
        });

        expect(result.hasFailed).toBe(false);
        expect(job.changeDelay).toHaveBeenCalledWith(15_000);
        expect(job.updateData).toHaveBeenCalledWith(
            expect.objectContaining({ countDelayed: 1, delayInSeconds: 15 }),
        );
        expect(job.promote).not.toHaveBeenCalled();
    });

    it("calls both changeDelay and update in parallel", async () => {
        const job = makeMockJob(2);
        const callOrder: string[] = [];
        job.changeDelay = vi.fn().mockImplementation(async () => { callOrder.push("changeDelay"); });
        job.updateData = vi.fn().mockImplementation(async () => { callOrder.push("update"); });

        await delayJob<TestMethods>({
            job: job as never,
            newPayload: makePayload(),
            newDelayInSeconds: 10,
        });

        expect(callOrder).toContain("changeDelay");
        expect(callOrder).toContain("update");
    });

    it("promotes the job when countDelayed reaches maxCountDelayed", async () => {
        const job = makeMockJob(4); // countDelayed will become 5 which equals maxCountDelayed

        const result = await delayJob<TestMethods>({
            job: job as never,
            newPayload: makePayload(),
            newDelayInSeconds: 10,
            maxCountDelayed: 5,
        });

        expect(result.hasFailed).toBe(false);
        expect(job.promote).toHaveBeenCalledOnce();
        expect(job.changeDelay).not.toHaveBeenCalled();
        expect(job.updateData).not.toHaveBeenCalled();
    });

    it("promotes the job when countDelayed exceeds maxCountDelayed", async () => {
        const job = makeMockJob(10);

        await delayJob<TestMethods>({
            job: job as never,
            newPayload: makePayload(),
            newDelayInSeconds: 10,
            maxCountDelayed: 3,
        });

        expect(job.promote).toHaveBeenCalledOnce();
    });

    it("returns an error when promote fails", async () => {
        const job = makeMockJob(4);
        job.promote = vi.fn().mockRejectedValue(new Error("promote error"));

        const result = await delayJob<TestMethods>({
            job: job as never,
            newPayload: makePayload(),
            newDelayInSeconds: 10,
            maxCountDelayed: 5,
        });

        expect(result.hasFailed).toBe(true);
        if (result.hasFailed) {
            expect(result.error.code).toBe("error_while_promoting_queue_job");
            expect(result.error.message).toContain("promote error");
        }
    });

    it("returns an error when changeDelay fails", async () => {
        const job = makeMockJob(0);
        job.changeDelay = vi.fn().mockRejectedValue(new Error("changeDelay error"));

        const result = await delayJob<TestMethods>({
            job: job as never,
            newPayload: makePayload(),
            newDelayInSeconds: 10,
        });

        expect(result.hasFailed).toBe(true);
        if (result.hasFailed) {
            expect(result.error.code).toBe("error_while_change_delay_queue_job");
            expect(result.error.message).toContain("changeDelay error");
        }
    });

    it("calls onDelayedJob callback after successful delay", async () => {
        const job = makeMockJob(0);
        const onDelayedJob = vi.fn();

        await delayJob<TestMethods>({
            job: job as never,
            newPayload: makePayload(),
            newDelayInSeconds: 10,
            onDelayedJob,
        });

        expect(onDelayedJob).toHaveBeenCalledWith(job);
    });

    it("does not call onDelayedJob when an error occurs", async () => {
        const job = makeMockJob(0);
        job.changeDelay = vi.fn().mockRejectedValue(new Error("fail"));
        const onDelayedJob = vi.fn();

        await delayJob<TestMethods>({
            job: job as never,
            newPayload: makePayload(),
            newDelayInSeconds: 10,
            onDelayedJob,
        });

        expect(onDelayedJob).not.toHaveBeenCalled();
    });
});
