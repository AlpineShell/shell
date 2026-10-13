import { describe, expect, it } from "vitest"
import { calculate } from "./launcherCalculator"

describe("calculate", () => {
  it("works out ordinary arithmetic", () => {
    expect(calculate("2 + 3 * 4")).toBe("14")
    expect(calculate("(2 + 3) * 4")).toBe("20")
  })

  it("reads ^ as a power and a comma as a decimal point", () => {
    expect(calculate("2^10")).toBe("1024")
    expect(calculate("1,5 * 2")).toBe("3")
  })

  it("trims floating point noise", () => {
    expect(calculate("0.1 + 0.2")).toBe("0.3")
  })

  it("leaves plain numbers and words alone", () => {
    expect(calculate("42")).toBeNull()
    expect(calculate("notepad")).toBeNull()
    expect(calculate("2 + x")).toBeNull()
  })

  it("has no answer for division by zero or broken expressions", () => {
    expect(calculate("1 / 0")).toBeNull()
    expect(calculate("2 * (3")).toBeNull()
  })
})
