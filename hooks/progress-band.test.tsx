import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'tasks',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const TOOL = 'mcp__tasks__report_progress'

// Stands for the engine beneath the plugin: an empty band, a turn's end.
function engine(on: Parameters<Parameters<typeof test>[1]>[1]) {
  let spawned = 0
  on('agent.spawn', () => ({ model: 'm', agentId: `a${++spawned}` }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="beneath" />
  })
}

function ended(agentId: string) {
  return { agentId, answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as const
}

function steps(...statuses: string[]) {
  return statuses.map((status, i) => ({ title: `Step ${i + 1}`, status }))
}

test('the main plan shows its done steps and the current one', async ($, on) => {
  await $.tool.call({ tool: TOOL, steps: steps('completed', 'in_progress', 'pending') })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const plan = await ui.find({ key: 'Plan' })
    expect(plan?.text).toMatch(/Plan\s+▰{3}▱{7}\s*1\/3\s*Step 2/)
    expect(await ui.find({ key: 'Agents' })).toBeUndefined()
    await ui.unmount()
  }
})

test('a malformed list is refused', async ($, on) => {
  engine(on)
  const result = await $.tool.call({ tool: TOOL, steps: [{ title: 'x', status: 'done' }] })
  expect(result.deny).toMatch(/status must be one of/)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'Plan' })).toBeUndefined()
  await ui.unmount()
})

test('agents share one line: their steps summed, running and finished counted', async ($, on) => {
  engine(on)
  for (const description of ['TL-1', 'TL-2', 'TL-3']) {
    await $.agent.spawn({ prompt: 'p', description })
  }
  await $.tool.call({ tool: TOOL, agentId: 'a1', steps: steps('completed', 'pending') })
  await $.tool.call({ tool: TOOL, agentId: 'a2', steps: steps('completed', 'completed', 'in_progress') })
  // a3 posts no plan and ends: one step, done.
  await $.turn.complete(ended('a3'))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'Agents' }))?.text).toMatch(/4\/6\s*2 running · 1 finished/)
  await ui.unmount()

  // A completed agent counts as finished even with steps left open.
  await $.turn.complete(ended('a1'))
  const after = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await after.find({ key: 'Agents' }))?.text).toMatch(/5\/6\s*1 running · 2 finished/)
  await after.unmount()
})

test('a spawn after every agent ended starts a new batch', async ($, on) => {
  engine(on)
  await $.agent.spawn({ prompt: 'p', description: 'old' })
  await $.tool.call({ tool: TOOL, agentId: 'a1', steps: steps('completed') })
  await $.turn.complete(ended('a1'))
  await $.agent.spawn({ prompt: 'p', description: 'new' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'Agents' }))?.text).toMatch(/0\/1\s*1 running · 0 finished/)
  await ui.unmount()
})

test('nothing to show leaves the band alone', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'beneath' })).toBeDefined()
  await ui.unmount()
})

test('clear drops the main plan', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: TOOL, steps: steps('in_progress') })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'clear' })
  expect(await ui.find({ key: 'Plan' })).toBeUndefined()
  await ui.unmount()
})
