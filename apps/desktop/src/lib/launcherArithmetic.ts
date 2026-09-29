const TOKEN_SOURCE = String.raw`\s*(\d+(?:\.\d*)?|\.\d+|\*\*|[-+*/%()])\s*`

function tokenize(expression: string): string[] {
  const pattern = new RegExp(TOKEN_SOURCE, 'y')
  const tokens: string[] = []
  while (pattern.lastIndex < expression.length) {
    const match = pattern.exec(expression)
    if (!match) throw new SyntaxError(`unexpected character in "${expression}"`)
    tokens.push(match[1])
  }
  return tokens
}

function isNumberToken(token: string | undefined): token is string {
  return token !== undefined && /^[\d.]/.test(token)
}

function applyProduct(operator: string, left: number, right: number): number {
  if (operator === '*') return left * right
  if (operator === '/') return left / right
  return left % right
}

export function evaluateArithmetic(expression: string): number {
  const tokens = tokenize(expression)
  let position = 0

  function take(): string | undefined {
    const token = tokens[position]
    position += 1
    return token
  }

  function primary(): number {
    const token = take()
    if (token === '(') {
      const value = sum()
      if (take() !== ')') throw new SyntaxError('missing closing bracket')
      return value
    }
    if (!isNumberToken(token)) throw new SyntaxError('expected a number')
    return Number(token)
  }

  function power(): number {
    const base = primary()
    if (tokens[position] !== '**') return base
    position += 1
    return base ** signed()
  }

  function signed(): number {
    const token = tokens[position]
    if (token !== '-' && token !== '+') return power()
    position += 1
    const value = signed()
    return token === '-' ? -value : value
  }

  function product(): number {
    let value = signed()
    while (tokens[position] === '*' || tokens[position] === '/' || tokens[position] === '%') {
      const operator = take() as string
      value = applyProduct(operator, value, signed())
    }
    return value
  }

  function sum(): number {
    let value = product()
    while (tokens[position] === '+' || tokens[position] === '-') {
      const operator = take()
      const operand = product()
      value = operator === '+' ? value + operand : value - operand
    }
    return value
  }

  const result = sum()
  if (position !== tokens.length) throw new SyntaxError(`unexpected "${tokens[position]}"`)
  return result
}
