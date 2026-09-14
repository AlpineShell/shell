import { describe, expect, it } from "vitest";
import { powerMenuPress } from "./powerMenuPress";

const ACTIONS: PowerAction[] = ["logout", "restart", "shutdown"];

describe("powerMenuPress with confirmation off", () => {
    it.each(ACTIONS)("runs %s on the first press", (action) => {
        expect(powerMenuPress(null, action, false)).toEqual({ run: action });
    });

    it("runs the pressed action even while another one is armed", () => {
        expect(powerMenuPress("shutdown", "restart", false)).toEqual({ run: "restart" });
    });
});

describe("powerMenuPress with confirmation on", () => {
    it.each(ACTIONS)("arms %s on the first press instead of running it", (action) => {
        expect(powerMenuPress(null, action, true)).toEqual({ armed: action });
    });

    it.each(ACTIONS)("runs %s when it is pressed again while armed", (action) => {
        expect(powerMenuPress(action, action, true)).toEqual({ run: action });
    });

    it("moves the arm to a different action rather than running either", () => {
        expect(powerMenuPress("shutdown", "logout", true)).toEqual({ armed: "logout" });
    });
});
