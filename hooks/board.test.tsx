import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'tasks',
  component: 'Pane',
  requestId: 'task-board',
  props: {
    title: 'Tasks',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const INLINE = { ...PANE, props: { ...PANE.props, placement: 'inline' } } as const
const CREATE = 'mcp__tasks__create'
const ROOT = '/repo'

const FILES: Record<string, string> = {
  '.tasks/.tasks-config.json': '{ "taskPrefix": "TL" }',
  '.tasks/open/TL-205.md': '**TL-205** — **Third.** Body three',
  '.tasks/open/TL-167.md': '**TL-167** — **First.** Body one\n- detail',
  '.tasks/open/.gitkeep': '',
  '.tasks/inProgress/TL-200.md': '**TL-200** — **Second.** Body two',
  '.tasks/done/TL-300.md': '**TL-300** — **Old.** Done',
}

// Stands for the engine: the project's files, a placed pane, the prompt box.
function engine(
  on: Parameters<Parameters<typeof test>[1]>[1],
  start: Record<string, string> = FILES,
  placed: { isPlaced: true } | { isPlaced: false; reason: string } = {
    isPlaced: true,
  },
) {
  const files = new Map(
    Object.entries(start).map(([path, text]) => [`${ROOT}/${path}`, text]),
  )
  const seen = {
    fills: [] as string[],
    closes: 0,
    opened: [] as { columns?: number }[],
    files,
  }
  on('session.root', () => ({ value: ROOT }))
  on('command.register', () => ({ value: { command: 'task-board' } }))
  on('ui.open', (_, e) => {
    seen.opened.push(e)
    return { value: placed }
  })
  on('ui.close', () => {
    seen.closes += 1
    return { value: undefined }
  })
  on('fs.list', (_, e) => {
    const names = [...files.keys()]
      .filter(path => path.startsWith(`${e.path}/`))
      .map(path => path.slice(e.path.length + 1))
      .filter(name => !name.includes('/'))
    if (names.length === 0) throw new Error(`ENOENT: ${e.path}`)
    return {
      value: names.map(name => ({
        name, kind: 'file', size: 1, mtimeMs: 0, isLink: false,
      })),
    }
  })
  on('fs.read', (_, e) => {
    const text = files.get(e.path)
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  on('fs.exists', (_, e) => ({ value: files.has(e.path) }))
  on('fs.write', (_, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('prompt.fill', (_, e) => {
    seen.fills.push(e.text)
    return { isFilled: true }
  })
  return seen
}

test('the board lists tasks in progress first, then the open ones', async ($, on) => {
  engine(on)
  const result = await $.command.run({ command: 'task-board', args: '' })
  expect(result.text).toBe('3 tasks.')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const rows = await ui.findAll({ type: 'Button', text: /^\[/ })
    expect(rows.map(row => row.text)).toEqual([
      '[ ] TL-200 ▶ Second',
      '[ ] TL-167 First',
      '[ ] TL-205 Third',
    ])
    expect((await ui.find({ type: 'Markdown' }))?.text).toBe(
      '**TL-200** — **Second.** Body two',
    )
    expect((await ui.find({ type: 'Text', text: /open ·/ }))?.text).toMatch(
      /^2 open · 1 in progress · 0 marked/,
    )
    await ui.unmount()
  }
})

test('the prefix comes from the config', async ($, on) => {
  engine(on, {
    '.tasks/.tasks-config.json': '{ "taskPrefix": "APP" }',
    '.tasks/open/APP-1.md': '**APP-1** — **Mine.** Body',
    '.tasks/open/TL-2.md': '**TL-2** — **Not mine.** Body',
  })
  await $.command.run({ command: 'task-board', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const rows = await ui.findAll({ type: 'Button', text: /^\[/ })
  expect(rows.map(row => row.text)).toEqual(['[ ] APP-1 Mine'])
  await ui.unmount()
})

test('without a config the board says to run /tasks:init', async ($, on) => {
  engine(on, { '.tasks/open/TL-1.md': '**TL-1** — **One.** Body' })
  const result = await $.command.run({ command: 'task-board', args: '' })
  expect(result.text).toMatch(/run \/tasks:init/)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /run \/tasks:init/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /^\[/ })).toBeUndefined()
  await ui.unmount()
})

test('docked, the list stacks above the text; inline, they sit side by side', async ($, on) => {
  engine(on)
  await $.command.run({ command: 'task-board', args: '' })

  const docked = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await docked.find({ key: 'stacked' })).toBeDefined()
  expect(await docked.find({ key: 'side-by-side' })).toBeUndefined()
  await docked.unmount()

  const inline = await $.ui.mount({ ...INLINE, surface: 'terminal' })
  expect(await inline.find({ key: 'side-by-side' })).toBeDefined()
  expect(await inline.find({ key: 'stacked' })).toBeUndefined()
  await inline.unmount()
})

test('the pane asks for the widest dock', async ($, on) => {
  const seen = engine(on)
  await $.command.run({
    command: 'task-board',
    args: '',
    // The engine sets it in a session; the kit passes what the test gives.
    presentation: { isFullscreen: true, columns: 200 },
  } as Parameters<typeof $.command.run>[0])
  expect(seen.opened[0].columns).toBe(90)
})

test('Enter marks rows and i fills the prompt with them in id order', async ($, on) => {
  const seen = engine(on)
  await $.command.run({ command: 'task-board', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'TL-205' })
  await ui.press({ key: 'TL-167' })
  expect((await ui.find({ key: 'TL-205' }))?.text).toBe('[x] TL-205 Third')
  await ui.press({ key: 'implement' })

  expect(seen.fills).toEqual(['/tasks:implement TL-167, TL-205'])
  expect(seen.closes).toBe(1)
  await ui.unmount()
})

test('a second Enter unmarks; with nothing marked i takes the highlighted', async ($, on) => {
  const seen = engine(on)
  await $.command.run({ command: 'task-board', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'TL-167' })
  await ui.press({ key: 'TL-167' })
  await ui.press({ key: 'implement' })

  expect(seen.fills).toEqual(['/tasks:implement TL-200'])
  await ui.unmount()
})

test('q closes without touching the prompt', async ($, on) => {
  const seen = engine(on)
  await $.command.run({ command: 'task-board', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'close' })

  expect(seen.closes).toBe(1)
  expect(seen.fills).toEqual([])
  await ui.unmount()
})

test('a pane the surface does not place says why', async ($, on) => {
  engine(on, FILES, { isPlaced: false, reason: 'no-surface' })
  const result = await $.command.run({ command: 'task-board', args: '' })
  expect(result.text).toBe('3 tasks, but the pane is not shown: no-surface')
})

test('no open tasks says so', async ($, on) => {
  engine(on, { '.tasks/.tasks-config.json': '{ "taskPrefix": "TL" }' })
  await $.command.run({ command: 'task-board', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /No open tasks/ })).toBeDefined()
  await ui.unmount()
})

test('create writes the next id over all three folders into open/', async ($, on) => {
  const seen = engine(on)
  const result = await $.tool.call({
    tool: CREATE,
    title: 'Add a thing',
    description: 'Because.\n- detail',
  })
  expect(result.result).toBe('Created TL-301: .tasks/open/TL-301.md')
  expect(seen.files.get(`${ROOT}/.tasks/open/TL-301.md`)).toBe(
    '**TL-301** — **Add a thing.** Because.\n- detail\n',
  )
})

test('create in a fresh project starts at 1', async ($, on) => {
  const seen = engine(on, { '.tasks/.tasks-config.json': '{ "taskPrefix": "APP" }' })
  const result = await $.tool.call({ tool: CREATE, title: 'First' })
  expect(result.result).toBe('Created APP-1: .tasks/open/APP-1.md')
  expect(seen.files.get(`${ROOT}/.tasks/open/APP-1.md`)).toBe('**APP-1** — **First.**\n')
})

test('create refuses without a config or a title', async ($, on) => {
  engine(on, {})
  expect((await $.tool.call({ tool: CREATE, title: 'x' })).deny).toMatch(/\/tasks:init/)
  expect((await $.tool.call({ tool: CREATE, title: '' })).deny).toMatch(/title/)
})
