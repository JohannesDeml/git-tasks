import { describe, expect, test } from 'claude-code/testing'

import type { Task } from '../types'
import {
  countLine,
  dockColumns,
  implementPrompt,
  moveHighlight,
  nextTaskId,
  parseConfig,
  parseNewTask,
  rowLabel,
  sortTasks,
  stackedListRows,
  taskFileText,
  taskNumber,
  taskTitle,
  toggleMark,
  toTask,
  visibleRange,
} from './tasks'

const task = (
  number: number,
  title = `Title ${number}`,
  status: Task['status'] = 'open',
): Task => ({
  id: `TL-${number}`,
  number,
  status,
  title,
  text: `**TL-${number}** — **${title}.** Body`,
})

describe('config', () => {
  test('the prefix is letters and digits, starting with a letter', async () => {
    expect(parseConfig('{ "taskPrefix": "TL" }')).toEqual({ taskPrefix: 'TL' })
    expect(parseConfig('{ "taskPrefix": "App2" }')).toEqual({ taskPrefix: 'App2' })
    expect(typeof parseConfig('{ "taskPrefix": "T-L" }')).toBe('string')
    expect(typeof parseConfig('{ "taskPrefix": "2X" }')).toBe('string')
    expect(typeof parseConfig('{}')).toBe('string')
    expect(typeof parseConfig('null')).toBe('string')
    expect(parseConfig('{ broken')).toMatch(/not valid JSON/)
  })
})

describe('task files', () => {
  test('only <prefix>-<n>.md names are tasks', async () => {
    expect(taskNumber('TL-167.md', 'TL')).toBe(167)
    expect(taskNumber('TL-167.txt', 'TL')).toBeUndefined()
    expect(taskNumber('XY-167.md', 'TL')).toBeUndefined()
    expect(taskNumber('.gitkeep', 'TL')).toBeUndefined()
  })

  test('the title is the bold part after the id, without its period', async () => {
    expect(
      taskTitle('**TL-200** — **Task board (`/task-board`).** A mod\n- more', 'TL'),
    ).toBe('Task board (`/task-board`)')
    expect(taskTitle('**APP-3** — **Other prefix.** Body', 'APP')).toBe('Other prefix')
  })

  test('a task without a bold title shows the rest of its first line', async () => {
    expect(taskTitle('**TL-1** — Design the model: how\nsecond line', 'TL')).toBe(
      'Design the model: how',
    )
    expect(taskTitle('**TL-7** [DEPRECATED] — ~~Old~~', 'TL')).toBe('~~Old~~')
  })

  test('toTask keeps the whole text and its status', async () => {
    const text = '**TL-12** — **Twelve.** Body\n- bullet'
    expect(toTask('TL-12.md', text, 'TL', 'inProgress')).toEqual({
      id: 'TL-12',
      number: 12,
      status: 'inProgress',
      title: 'Twelve',
      text,
    })
    expect(toTask('notes.md', text, 'TL', 'open')).toBeUndefined()
  })

  test('tasks in progress come first, each group by number', async () => {
    const sorted = sortTasks([
      task(100),
      task(9),
      task(50, 'x', 'inProgress'),
      task(20),
      task(3, 'y', 'inProgress'),
    ])
    expect(sorted.map(t => t.id)).toEqual(['TL-3', 'TL-50', 'TL-9', 'TL-20', 'TL-100'])
  })
})

describe('new tasks', () => {
  test('the next id is the highest number + 1, other names ignored', async () => {
    expect(nextTaskId(['TL-9.md', 'TL-120.md', 'TL-12.md', '.gitkeep', 'XY-500.md'], 'TL'))
      .toBe('TL-121')
    expect(nextTaskId([], 'APP')).toBe('APP-1')
  })

  test('the input needs a one-line title; the description is optional', async () => {
    expect(parseNewTask({ title: ' Fix it ', description: ' Body ' })).toEqual({
      title: 'Fix it',
      description: 'Body',
    })
    expect(parseNewTask({ title: 'Fix it' })).toEqual({ title: 'Fix it', description: '' })
    expect(typeof parseNewTask({ title: '' })).toBe('string')
    expect(typeof parseNewTask({ title: 'a\nb' })).toBe('string')
    expect(typeof parseNewTask({ title: 'a', description: 3 })).toBe('string')
    expect(typeof parseNewTask(undefined)).toBe('string')
  })

  test('the file is the id, the bold title with its period, the description', async () => {
    expect(taskFileText('TL-5', 'Fix it', 'Body\n- more')).toBe(
      '**TL-5** — **Fix it.** Body\n- more\n',
    )
    expect(taskFileText('TL-5', 'Why?', '')).toBe('**TL-5** — **Why?**\n')
  })
})

describe('picking', () => {
  const list = [task(205, 'Third', 'inProgress'), task(167), task(200)]

  test('toggleMark adds and removes', async () => {
    expect(toggleMark([], 'TL-200')).toEqual(['TL-200'])
    expect(toggleMark(['TL-200', 'TL-167'], 'TL-200')).toEqual(['TL-167'])
  })

  test('the prompt lists the marked tasks in id order', async () => {
    expect(implementPrompt(list, ['TL-205', 'TL-167'], 'TL-200')).toBe(
      '/tasks:implement TL-167, TL-205',
    )
  })

  test('with nothing marked the prompt takes the highlighted task', async () => {
    expect(implementPrompt(list, [], 'TL-200')).toBe('/tasks:implement TL-200')
    expect(implementPrompt(list, ['TL-999'], 'TL-205')).toBe('/tasks:implement TL-205')
  })

  test('no tasks, no prompt', async () => {
    expect(implementPrompt([], [], '')).toBeUndefined()
  })

  test('the highlight moves one row per scroll and stops at the ends', async () => {
    expect(moveHighlight(list, 'TL-205', 1)).toBe('TL-167')
    expect(moveHighlight(list, 'TL-167', -3)).toBe('TL-205')
    expect(moveHighlight(list, 'TL-200', 1)).toBe('TL-200')
    expect(moveHighlight(list, 'gone', 1)).toBe('TL-167')
    expect(moveHighlight([], '', 1)).toBeUndefined()
  })
})

describe('layout', () => {
  test('rows show the mark, a running task its arrow, and are cut to the width', async () => {
    expect(rowLabel(task(5, 'Short'), true, 40)).toBe('[x] TL-5 Short')
    expect(rowLabel(task(5, 'Short', 'inProgress'), false, 40)).toBe('[ ] TL-5 ▶ Short')
    const cut = rowLabel(task(5, 'A rather long task title'), false, 16)
    expect(cut).toBe('[ ] TL-5 A rath…')
    expect(cut.length).toBe(16)
  })

  test('the count line names tasks in progress only when there are some', async () => {
    expect(countLine([task(1), task(2)], 0)).toBe('2 open · 0 marked')
    expect(countLine([task(1), task(2, 'x', 'inProgress')], 1)).toBe(
      '1 open · 1 in progress · 1 marked',
    )
  })

  test('the dock asks for 45 % of the terminal, at least 24 columns', async () => {
    expect(dockColumns(200)).toBe(90)
    expect(dockColumns(111)).toBe(49)
    expect(dockColumns(40)).toBe(24)
  })

  test('stacked, the list takes a third of the rows, 3 to the tasks it has', async () => {
    expect(stackedListRows(42, 30)).toBe(14)
    expect(stackedListRows(42, 5)).toBe(5)
    expect(stackedListRows(6, 30)).toBe(3)
    expect(stackedListRows(42, 2)).toBe(2)
  })

  test('the visible range keeps the highlight in view', async () => {
    expect(visibleRange(3, 2, 10)).toEqual([0, 3])
    expect(visibleRange(30, 0, 10)).toEqual([0, 10])
    expect(visibleRange(30, 15, 10)).toEqual([10, 20])
    expect(visibleRange(30, 29, 10)).toEqual([20, 30])
    expect(visibleRange(30, 5, 0)).toEqual([5, 6])
  })
})
