import { expect, test } from 'claude-code/testing'

import { bar, currentStep, parseSteps, summarizeBatch } from './progress'

test('parseSteps takes a list of titles and statuses and trims titles', () => {
  expect(parseSteps({ steps: [{ title: ' Tests ', status: 'pending' }] })).toEqual([
    { title: 'Tests', status: 'pending' },
  ])
  expect(typeof parseSteps({ steps: [] })).toBe('string')
  expect(typeof parseSteps({ steps: [{ title: '', status: 'pending' }] })).toBe('string')
  expect(typeof parseSteps({ steps: [{ title: 'x', status: 'done' }] })).toBe('string')
})

test('the current step is the one in progress, else the next pending', () => {
  expect(
    currentStep([
      { title: 'a', status: 'pending' },
      { title: 'b', status: 'in_progress' },
    ]),
  ).toBe('b')
  expect(currentStep([{ title: 'a', status: 'completed' }, { title: 'b', status: 'pending' }])).toBe('b')
  expect(currentStep([{ title: 'a', status: 'completed' }])).toBeUndefined()
})

test('the bar has ten cells, empty without steps', () => {
  expect(bar({ done: 1, total: 4 })).toEqual({ filled: '▰▰▰', empty: '▱▱▱▱▱▱▱' })
  expect(bar({ done: 0, total: 0 })).toEqual({ filled: '', empty: '▱'.repeat(10) })
})

test('a failed agent counts only the steps it finished', () => {
  const summary = summarizeBatch(
    { a: { description: '', isEnded: true, isCompleted: false } },
    { a: [{ title: 'x', status: 'completed' }, { title: 'y', status: 'pending' }] },
  )
  expect(summary).toEqual({ done: 1, total: 2, running: 0, ended: 1 })
})
