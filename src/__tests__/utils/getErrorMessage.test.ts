import { describe, it, expect } from "vitest";
import { getErrorMessage } from "../../utils/getErrorMessage.js";

describe("getErrorMessage", () => {
    it("returns the message from an Error instance", () => {
        const error = new Error("Something went wrong");
        expect(getErrorMessage(error)).toBe("Something went wrong");
    });

    it("returns a plain string as-is", () => {
        expect(getErrorMessage("plain string error")).toBe("plain string error");
    });

    it("returns the fallback message for a number", () => {
        expect(getErrorMessage(42)).toBe("An unknown error occurred");
    });

    it("returns the fallback message for null", () => {
        expect(getErrorMessage(null)).toBe("An unknown error occurred");
    });

    it("returns the fallback message for undefined", () => {
        expect(getErrorMessage(undefined)).toBe("An unknown error occurred");
    });

    it("returns the fallback message for an object", () => {
        expect(getErrorMessage({ code: 500 })).toBe("An unknown error occurred");
    });

    it("returns an empty string when the Error message is empty", () => {
        const error = new Error("");
        expect(getErrorMessage(error)).toBe("");
    });
});
