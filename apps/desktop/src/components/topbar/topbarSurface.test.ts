import { describe, expect, it } from "vitest";
import { topbarSurface } from "./topbarSurface";

describe("topbarSurface", () => {
    it("falls back to the shipped dark bar with light text when no colour is known", () => {
        expect(topbarSurface(null)).toEqual({
            bg: "rgb(31,32,32)",
            darkText: false,
            borderColor: "rgba(255,255,255,0.12)",
        });
    });

    it("paints a light colour with dark text and a dark hairline", () => {
        expect(topbarSurface({ r: 236, g: 230, b: 218, darkText: true })).toEqual({
            bg: "rgb(236,230,218)",
            darkText: true,
            borderColor: "rgba(0,0,0,0.12)",
        });
    });

    it("paints a dark colour with light text and a light hairline", () => {
        expect(topbarSurface({ r: 12, g: 40, b: 64, darkText: false })).toEqual({
            bg: "rgb(12,40,64)",
            darkText: false,
            borderColor: "rgba(255,255,255,0.12)",
        });
    });
});
