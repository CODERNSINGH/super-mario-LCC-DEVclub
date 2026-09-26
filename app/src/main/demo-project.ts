/** Files for the built-in demo project: a tiny Node library with 4 deliberately planted bugs (see BUGS.md). */
export const DEMO_FILES: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'sakai-demo',
    version: '1.0.0',
    description: 'Practice project for Sakai: four planted bugs, each with a failing test.',
    main: 'src/calculator.js',
    scripts: { test: 'jest' },
    devDependencies: { jest: '^29.7.0' },
  }, null, 2) + '\n',
  '.gitignore': 'node_modules/\ncoverage/\n.DS_Store\n',
  'README.md': `# sakai-demo

A small JavaScript library used to try Sakai without connecting GitHub.

\`\`\`bash
npm install
npm test        # 4 tests fail — one per planted bug
\`\`\`

The bugs are described like GitHub issues in [BUGS.md](BUGS.md). Pick one in Sakai and let it fix it,
or add your own bugs to the source and see whether Sakai can find them.
`,
  'BUGS.md': `# Planted bugs

Each bug has exactly one failing test. Fix all four and \`npm test\` is green.

## 1. \`Calculator.subtract()\` returns the wrong sign
**Steps:** \`new Calculator(20).subtract(5)\`
**Expected:** \`15\`  **Actual:** \`-15\`
File: \`src/calculator.js\`

## 2. \`average()\` is too large
**Steps:** \`average([2, 4, 6])\`
**Expected:** \`4\`  **Actual:** \`6\`
File: \`src/utils.js\`

## 3. \`isPalindrome()\` is case- and punctuation-sensitive
**Steps:** \`isPalindrome("A man, a plan, a canal: Panama")\`
**Expected:** \`true\`  **Actual:** \`false\`
File: \`src/utils.js\`

## 4. \`Stack.peek()\` removes the top item
**Steps:** push 1, push 2, \`peek()\`, then \`size\`
**Expected:** peek returns \`2\` and size stays \`2\`  **Actual:** size becomes \`1\`
File: \`src/stack.js\`
`,
  'src/calculator.js': `class Calculator {
  constructor(initial = 0) {
    this.value = initial
  }

  add(n) {
    this.value = this.value + n
    return this.value
  }

  subtract(n) {
    this.value = n - this.value
    return this.value
  }

  multiply(n) {
    this.value = this.value * n
    return this.value
  }

  divide(n) {
    if (n === 0) throw new Error('Division by zero')
    this.value = this.value / n
    return this.value
  }
}

module.exports = Calculator
`,
  'src/utils.js': `/** Arithmetic mean of a list of numbers; 0 for an empty list. */
function average(list) {
  if (list.length === 0) return 0
  const sum = list.reduce((a, b) => a + b, 0)
  return sum / (list.length - 1)
}

/** True if the text reads the same forwards and backwards, ignoring case and non-alphanumerics. */
function isPalindrome(text) {
  const s = text
  return s === s.split('').reverse().join('')
}

/** Limits n to the range [min, max]. */
function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max)
}

module.exports = { average, isPalindrome, clamp }
`,
  'src/stack.js': `class Stack {
  constructor() {
    this.items = []
  }

  push(item) {
    this.items.push(item)
  }

  pop() {
    if (this.items.length === 0) throw new Error('Stack is empty')
    return this.items.pop()
  }

  /** Returns the top item without removing it. */
  peek() {
    if (this.items.length === 0) throw new Error('Stack is empty')
    return this.items.pop()
  }

  get size() {
    return this.items.length
  }
}

module.exports = Stack
`,
  'tests/calculator.test.js': `const Calculator = require('../src/calculator')

describe('Calculator', () => {
  test('adds', () => {
    expect(new Calculator(2).add(3)).toBe(5)
  })

  test('subtracts from the current value', () => {
    expect(new Calculator(20).subtract(5)).toBe(15)
  })

  test('multiplies', () => {
    expect(new Calculator(4).multiply(3)).toBe(12)
  })

  test('divides and rejects division by zero', () => {
    expect(new Calculator(9).divide(3)).toBe(3)
    expect(() => new Calculator(1).divide(0)).toThrow('Division by zero')
  })
})
`,
  'tests/utils.test.js': `const { average, isPalindrome, clamp } = require('../src/utils')

describe('average', () => {
  test('mean of a list', () => {
    expect(average([2, 4, 6])).toBe(4)
  })
  test('empty list is 0', () => {
    expect(average([])).toBe(0)
  })
})

describe('isPalindrome', () => {
  test('ignores case and punctuation', () => {
    expect(isPalindrome('A man, a plan, a canal: Panama')).toBe(true)
  })
  test('rejects non-palindromes', () => {
    expect(isPalindrome('sakai')).toBe(false)
  })
})

describe('clamp', () => {
  test('limits to the range', () => {
    expect(clamp(15, 0, 10)).toBe(10)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(5, 0, 10)).toBe(5)
  })
})
`,
  'tests/stack.test.js': `const Stack = require('../src/stack')

describe('Stack', () => {
  test('push and pop', () => {
    const s = new Stack()
    s.push(1)
    s.push(2)
    expect(s.pop()).toBe(2)
    expect(s.size).toBe(1)
  })

  test('peek does not remove the top item', () => {
    const s = new Stack()
    s.push(1)
    s.push(2)
    expect(s.peek()).toBe(2)
    expect(s.size).toBe(2)
  })

  test('empty stack throws', () => {
    expect(() => new Stack().pop()).toThrow('Stack is empty')
  })
})
`,
}
