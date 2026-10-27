import type { Task, TaskStatus } from '../types'

export const TASKS_DIR = '.tasks'
export const CONFIG_FILE = `${TASKS_DIR}/.tasks-config.json`
export const STATUS_DIRS = ['open', 'inProgress', 'done'] as const
export type StatusDir = (typeof STATUS_DIRS)[number]

export type TasksConfig = { taskPrefix: string }

const prefixShape = /^[A-Za-z][A-Za-z0-9]*$/

/** The config file's content, or why it can't be used. */
export function parseConfig(text: string): TasksConfig | string {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return `${CONFIG_FILE} is not valid JSON`
  }
  const prefix = (json as { taskPrefix?: unknown } | null)?.taskPrefix
  if (typeof prefix !== 'string' || !prefixShape.test(prefix)) {
    return `${CONFIG_FILE} needs a "taskPrefix" of letters and digits, e.g. "TL"`
  }
  return { taskPrefix: prefix }
}

function escaped(prefix: string): string {
  return prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The task number of a file name (`TL-167.md`), else undefined. */
export function taskNumber(fileName: string, prefix: string): number | undefined {
  const match = new RegExp(`^${escaped(prefix)}-(\\d+)\\.md$`).exec(fileName)
  return match ? Number(match[1]) : undefined
}

/**
 * The bold `**Title.**` after `**P-n** — `, without its final period; tasks
 * without one fall back to the rest of the first line.
 */
export function taskTitle(text: string, prefix: string): string {
  const firstLine = text.split('\n', 1)[0]
  const rest = firstLine
    .replace(
      new RegExp(`^\\*\\*${escaped(prefix)}-\\d+\\*\\*(\\s*\\[DEPRECATED\\])?\\s*—\\s*`),
      '',
    )
    .trim()
  const bold = /^\*\*(.+?)\*\*/.exec(rest)
  return bold ? bold[1].replace(/\.$/, '') : rest
}

export function toTask(
  fileName: string,
  text: string,
  prefix: string,
  status: TaskStatus,
): Task | undefined {
  const number = taskNumber(fileName, prefix)
  if (number === undefined) return undefined
  return {
    id: `${prefix}-${number}`,
    number,
    status,
    title: taskTitle(text, prefix),
    text,
  }
}

/** Tasks in progress first, then open ones; by number within each. */
export function sortTasks(tasks: readonly Task[]): Task[] {
  const rank = (task: Task) => (task.status === 'inProgress' ? 0 : 1)
  return [...tasks].sort((a, b) => rank(a) - rank(b) || a.number - b.number)
}

/** The next free id: the highest number among all file names + 1. */
export function nextTaskId(fileNames: readonly string[], prefix: string): string {
  const numbers = fileNames
    .map(name => taskNumber(name, prefix))
    .filter(number => number !== undefined)
  return `${prefix}-${Math.max(0, ...numbers) + 1}`
}

/** What `create` takes, or why it refuses. */
export function parseNewTask(
  input: unknown,
): { title: string; description: string } | string {
  const { title, description } = (input ?? {}) as Record<string, unknown>
  if (typeof title !== 'string' || title.trim() === '') {
    return 'title must be a non-empty string'
  }
  if (title.includes('\n')) return 'title must be one line'
  if (description !== undefined && typeof description !== 'string') {
    return 'description must be a string'
  }
  return { title: title.trim(), description: (description ?? '').trim() }
}

/** A new task file: `**P-n** — **Title.** description`. */
export function taskFileText(id: string, title: string, description: string): string {
  const sentence = /[.!?]$/.test(title) ? title : `${title}.`
  const head = `**${id}** — **${sentence}**`
  return `${description === '' ? head : `${head} ${description}`}\n`
}

/** Adds or removes `id` from the marked ids. */
export function toggleMark(marked: readonly string[], id: string): string[] {
  return marked.includes(id)
    ? marked.filter(one => one !== id)
    : [...marked, id]
}

/**
 * The prompt for the marked tasks in id order, the highlighted one alone
 * when nothing is marked; undefined when there is neither.
 */
export function implementPrompt(
  tasks: readonly Task[],
  marked: readonly string[],
  highlighted: string,
): string | undefined {
  const known = tasks
    .filter(task => marked.includes(task.id))
    .sort((a, b) => a.number - b.number)
  const ids = known.length > 0
    ? known.map(task => task.id)
    : tasks.some(task => task.id === highlighted) ? [highlighted] : []
  return ids.length > 0 ? `/tasks:implement ${ids.join(', ')}` : undefined
}

/** The id one row up (`by` < 0) or down from `current`, clamped to the list. */
export function moveHighlight(
  tasks: readonly Task[],
  current: string,
  by: number,
): string | undefined {
  if (tasks.length === 0) return undefined
  const index = Math.max(0, tasks.findIndex(task => task.id === current))
  const next = Math.min(tasks.length - 1, Math.max(0, index + Math.sign(by)))
  return tasks[next].id
}

/**
 * One list row, `[x] TL-167 Title` (`▶` before the title while in progress),
 * cut with an ellipsis to `width` cells.
 */
export function rowLabel(task: Task, isMarked: boolean, width: number): string {
  const state = task.status === 'inProgress' ? '▶ ' : ''
  const label = `${isMarked ? '[x]' : '[ ]'} ${task.id} ${state}${task.title}`
  return label.length <= width ? label : `${label.slice(0, width - 1)}…`
}

/** The header's count line. */
export function countLine(tasks: readonly Task[], marked: number): string {
  const running = tasks.filter(task => task.status === 'inProgress').length
  const open = tasks.length - running
  const parts = [`${open} open`, ...(running > 0 ? [`${running} in progress`] : [])]
  return `${parts.join(' · ')} · ${marked} marked`
}

/** The widest dock Claude Code grants: 45 % of the terminal, at least 24. */
export function dockColumns(terminalColumns: number): number {
  return Math.max(24, Math.floor(terminalColumns * 0.45))
}

/** List rows above the text when stacked: a third of the body, at least 3. */
export function stackedListRows(bodyRows: number, count: number): number {
  return Math.min(count, Math.max(3, Math.floor(bodyRows / 3)))
}

/** The `[start, end)` slice of `count` rows that keeps `index` in `rows`. */
export function visibleRange(
  count: number,
  index: number,
  rows: number,
): [number, number] {
  const room = Math.max(1, rows)
  if (count <= room) return [0, count]
  const start = Math.min(
    count - room,
    Math.max(0, index - Math.floor(room / 2)),
  )
  return [start, start + room]
}
