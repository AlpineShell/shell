import { evaluateArithmetic } from "../launcherArithmetic"

const SIGNIFICANT_DIGITS = 12

export function calculate(expression: string): string | null {
  const text = expression.trim()
  if (!/[0-9]/.test(text) || !/[+\-*/%^]/.test(text)) return null
  if (!/^[\d\s+\-*/.%^(),]+$/.test(text)) return null
  try {
    const result = evaluateArithmetic(text.replace(/\^/g, "**").replace(/,/g, "."))
    if (!Number.isFinite(result)) return null
    return Number.isInteger(result) ? result.toString() : parseFloat(result.toPrecision(SIGNIFICANT_DIGITS)).toString()
  } catch {
    return null
  }
}
