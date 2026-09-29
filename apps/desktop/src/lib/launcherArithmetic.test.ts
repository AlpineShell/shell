import { describe, it, expect } from "vitest"
import { evaluateArithmetic } from "./launcherArithmetic"

describe("evaluateArithmetic", () => {
  it("adds, subtracts, multiplies, divides and takes remainders", () => {
    expect(evaluateArithmetic("2+3")).toBe(5)
    expect(evaluateArithmetic("10 - 4")).toBe(6)
    expect(evaluateArithmetic("6*7")).toBe(42)
    expect(evaluateArithmetic("7/2")).toBe(3.5)
    expect(evaluateArithmetic("17 % 5")).toBe(2)
    expect(evaluateArithmetic("0.1 + .2")).toBeCloseTo(0.3)
  })

  it("follows the usual order of operations and brackets", () => {
    expect(evaluateArithmetic("2+3*4")).toBe(14)
    expect(evaluateArithmetic("(2+3)*4")).toBe(20)
    expect(evaluateArithmetic("10-4-3")).toBe(3)
    expect(evaluateArithmetic("100/10/5")).toBe(2)
    expect(evaluateArithmetic("2*(3+(4-1))/3")).toBe(4)
  })

  it("raises to a power from right to left, above signs", () => {
    expect(evaluateArithmetic("2**10")).toBe(1024)
    expect(evaluateArithmetic("2**3**2")).toBe(512)
    expect(evaluateArithmetic("2**-1")).toBe(0.5)
    expect(evaluateArithmetic("-2**2")).toBe(-4)
    expect(evaluateArithmetic("(-2)**2")).toBe(4)
  })

  it("reads signs in front of numbers and brackets", () => {
    expect(evaluateArithmetic("-5+2")).toBe(-3)
    expect(evaluateArithmetic("3*-2")).toBe(-6)
    expect(evaluateArithmetic("-(2+3)")).toBe(-5)
    expect(evaluateArithmetic("+4-1")).toBe(3)
  })

  it("leaves infinity and not-a-number to the caller", () => {
    expect(evaluateArithmetic("1/0")).toBe(Infinity)
    expect(evaluateArithmetic("0/0")).toBeNaN()
  })

  it("refuses anything that is not a complete expression", () => {
    for (const expression of ["2+", "*2", "2 3+1", "(2+3", "2+3)", "()", "2(3)", "1.2.3+1", "2+*3", "", "   ", "2+x", "alert(1)+1"]) {
      expect(() => evaluateArithmetic(expression), expression).toThrow(SyntaxError)
    }
  })
})
