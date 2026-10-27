import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Task, TaskStatus } from '../types'
import {
  CONFIG_FILE,
  STATUS_DIRS,
  TASKS_DIR,
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
  toTask,
  toggleMark,
  visibleRange,
} from './tasks'
import type { TasksConfig } from './tasks'

const PANE = 'task-board'
const CREATE = 'create'
const tasks = atom({ plugin: 'tasks', key: 'tasks' } as const, [], {
  shape: 'tasks-1',
})
const marked = atom({ plugin: 'tasks', key: 'marked' } as const, [], {
  shape: 'marked-1',
})
const highlight = atom({ plugin: 'tasks', key: 'highlight' } as const, '', {
  shape: 'highlight-1',
})
const problem = atom({ plugin: 'tasks', key: 'problem' } as const, '', {
  shape: 'problem-1',
})

const CREATE_DESCRIPTION = `Creates a task file in .tasks/open/ with the next free id (prefix from .tasks/.tasks-config.json) and returns the id and path.
The file's first line is \`**<ID>** — **<title>.** <description>\`; the description may go on over further lines (bullets, paragraphs).`

// The config read from the project, or why there is none.
async function loadConfig($: EngineInterface): Promise<TasksConfig | string> {
  const root = await $.session.root()
  const text = await $.fs
    .read(`${root}/${CONFIG_FILE}`)
    .catch(() => undefined)
  return text === undefined
    ? `No ${CONFIG_FILE} in this project: run /tasks:init to set it up.`
    : parseConfig(String(text))
}

async function fileNames($: EngineInterface, dir: string): Promise<string[]> {
  const entries = await $.fs.list(dir).catch(() => [])
  return entries.filter(entry => entry.kind === 'file').map(entry => entry.name)
}

async function loadTasks($: EngineInterface, prefix: string): Promise<Task[]> {
  const root = await $.session.root()
  const statuses: TaskStatus[] = ['open', 'inProgress']
  const loaded = await Promise.all(
    statuses.map(async status => {
      const dir = `${root}/${TASKS_DIR}/${status}`
      return Promise.all(
        (await fileNames($, dir)).map(async name =>
          toTask(name, String(await $.fs.read(`${dir}/${name}`)), prefix, status),
        ),
      )
    }),
  )
  return sortTasks(loaded.flat().filter(task => task !== undefined))
}

async function implement($: EngineInterface): Promise<void> {
  const prompt = implementPrompt(
    await read($, tasks),
    await read($, marked),
    await read($, highlight),
  )
  if (prompt === undefined) return
  await $.ui.close({ id: PANE })
  await $.prompt.fill({ text: prompt })
}

/** The board's command and the create tool; called at the session's start. */
export async function startBoard($: EngineInterface): Promise<void> {
  await $.command.register({
    name: PANE,
    description: 'Pick open tasks in a pane and fill the prompt with /tasks:implement',
  })
  await $.tool.register({
    name: CREATE,
    description: CREATE_DESCRIPTION,
    isDeferred: false,
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title, one line' },
        description: {
          type: 'string',
          description: 'What follows the bold title (Markdown)',
        },
      },
      required: ['title'],
    },
  })
}

export const registerBoard: Register = on => {
  on('tool.call', { tool: `mcp__tasks__${CREATE}` }, async ($, e) => {
    const input = parseNewTask(e)
    if (typeof input === 'string') return { deny: input }
    const config = await loadConfig($)
    if (typeof config === 'string') return { deny: config }
    const root = await $.session.root()
    const names = await Promise.all(
      STATUS_DIRS.map(status => fileNames($, `${root}/${TASKS_DIR}/${status}`)),
    )
    const id = nextTaskId(names.flat(), config.taskPrefix)
    const path = `${TASKS_DIR}/open/${id}.md`
    if (await $.fs.exists(`${root}/${path}`)) {
      return { deny: `${path} exists already; call again for a new id` }
    }
    await $.fs.write(`${root}/${path}`, taskFileText(id, input.title, input.description))
    return { result: `Created ${id}: ${path}` }
  })

  on('command.run', { command: PANE }, async ($, e) => {
    const config = await loadConfig($)
    const open = typeof config === 'string' ? [] : await loadTasks($, config.taskPrefix)
    await update($, problem, () => (typeof config === 'string' ? config : ''))
    await update($, tasks, () => open)
    await update($, marked, () => [])
    await update($, highlight, () => open[0]?.id ?? '')
    const terminalColumns = e.presentation?.columns
    const opened = await $.ui.open({
      id: PANE,
      title: 'Tasks',
      focus: true,
      closeOnEscape: true,
      ...(terminalColumns ? { columns: dockColumns(terminalColumns) } : {}),
    })
    if (typeof config === 'string') return { text: config }
    if (!opened.isPlaced) {
      return {
        text: `${open.length} tasks, but the pane is not shown: ${opened.reason}`,
      }
    }
    return { text: `${open.length} tasks.` }
  })

  // Arrows that would scroll the body move the highlight instead (and the
  // focus ring with it, so Enter marks the highlighted row).
  on('ui.scroll', { requestId: PANE }, async ($, e) => {
    const next = moveHighlight(
      await read($, tasks),
      await read($, highlight),
      e.by,
    )
    if (next !== undefined) {
      await update($, highlight, () => next)
      void $.ui.focus({ requestId: PANE, key: next })
    }
    return {}
  })

  // Arrows that move the focus ring onto a row highlight that row.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const result = await next(e)
    const element = e.element
    const list = await read($, tasks)
    if (result.deny === undefined && list.some(t => t.id === element)) {
      await update($, highlight, () => element as string)
    }
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const why = await read($, problem)
    if (why !== '') return <Text color="warning">{why}</Text>
    const list = await read($, tasks)
    const picks = await read($, marked)
    if (list.length === 0) {
      return <Text dimColor>No open tasks in {TASKS_DIR}/open/.</Text>
    }
    const current = await read($, highlight)
    const index = Math.max(0, list.findIndex(t => t.id === current))
    // Docked (fullscreen layout) the pane is narrow and tall: the list stacks
    // above the text at the full width; inline it is wide and low.
    const isStacked = e.props.placement === 'dock'
    const { bodyColumns, scroll } = e.props
    const listWidth = isStacked
      ? bodyColumns
      : Math.max(24, Math.floor(bodyColumns * 0.4))
    const [start, end] = visibleRange(
      list.length,
      index,
      isStacked
        ? stackedListRows(scroll.bodyRows, list.length)
        : scroll.bodyRows - 2,
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Text dimColor>
            {countLine(list, picks.length)} · ↑↓ move · Enter mark
          </Text>
          <Button
            key="implement"
            label="implement"
            hotkey="i"
            plain
            onPress={() => void implement($)}
          />
          <Button
            key="close"
            label="close"
            hotkey="q"
            plain
            role="dismiss"
            onPress={() => void $.ui.close({ id: PANE })}
          />
        </Box>
        <Box
          key={isStacked ? 'stacked' : 'side-by-side'}
          flexDirection={isStacked ? 'column' : 'row'}
          gap={isStacked ? 1 : 2}
          marginTop={1}
        >
          <Box flexDirection="column" width={listWidth} flexShrink={0}>
            {list.slice(start, end).map(task => (
              <Button
                key={task.id}
                label={rowLabel(task, picks.includes(task.id), listWidth)}
                plain
                autoFocus={task.id === list[index].id ? true : undefined}
                onPress={() =>
                  void update($, marked, ids => toggleMark(ids, task.id))
                }
              />
            ))}
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            <Markdown text={list[index].text} />
          </Box>
        </Box>
      </Box>
    )
  })
}
