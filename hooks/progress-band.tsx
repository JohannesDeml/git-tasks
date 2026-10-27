import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Step } from '../types'
import {
  bar,
  countSteps,
  currentStep,
  isBatchOver,
  isFinished,
  parseSteps,
  summarizeBatch,
} from './progress'
import type { Count } from './progress'

const TOOL = 'report_progress'
const MAIN = 'main'
const plans = atom({ plugin: 'tasks', key: 'plans' } as const, {}, {
  shape: 'plans-1',
})
const batch = atom({ plugin: 'tasks', key: 'batch' } as const, {}, {
  shape: 'batch-1',
})

const DESCRIPTION = `Shows your plan's progress in a band above the user's prompt.
Call it with the whole step list (5–10 short steps) once you have planned a multi-step task, then again whenever a step starts or finishes, exactly one step in_progress while working.
Each call replaces the list of the agent that calls it; the main conversation and every subagent have their own list.`

// Keeps the main loop's plan; agents' plans go with the batch they belong to.
async function startBatch($: EngineInterface): Promise<void> {
  await update($, batch, () => ({}))
  await update($, plans, current =>
    current[MAIN] ? { [MAIN]: current[MAIN] } : {},
  )
}

/** The progress tool; register.tsx registers it at the session's start. */
export const PROGRESS_TOOL = {
  name: TOOL,
  description: DESCRIPTION,
  isDeferred: false,
  inputSchema: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'A few words' },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed'],
            },
          },
          required: ['title', 'status'],
        },
      },
    },
    required: ['steps'],
  },
} as const

export const registerProgress: Register = on => {
  on('tool.call', { tool: `mcp__tasks__${TOOL}` }, async ($, e) => {
    const steps = parseSteps(e)
    if (typeof steps === 'string') return { deny: steps }
    await update($, plans, current => ({ ...current, [e.agentId ?? MAIN]: steps }))
    const { done, total } = countSteps(steps)
    return { result: `Progress shown: ${done}/${total} steps done.` }
  })

  // A new prompt drops what is over: a finished plan, a batch whose agents all ended.
  on('prompt.submit', async ($, e, next) => {
    const main = (await read($, plans))[MAIN]
    if (main && isFinished(main)) {
      await update($, plans, ({ [MAIN]: _, ...rest }) => rest)
    }
    if (isBatchOver(await read($, batch))) await startBatch($)
    return next(e)
  })

  // Resumed agents spawn again and so count as running again.
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const id = result.agentId
    if (id === undefined) return result
    if (isBatchOver(await read($, batch))) await startBatch($)
    await update($, batch, current => ({
      ...current,
      [id]: { description: e.description ?? '', isEnded: false, isCompleted: false },
    }))
    return result
  })

  // A subagent's run is one turn: its end is the agent's.
  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined && (await read($, batch))[id]) {
      await update($, batch, current => ({
        ...current,
        [id]: { ...current[id], isEnded: true, isCompleted: e.reason === 'answer' },
      }))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const allPlans = await read($, plans)
    const agents = await read($, batch)
    const main: Step[] = allPlans[MAIN] ?? []
    const hasAgents = Object.keys(agents).length > 0
    if (main.length === 0 && !hasAgents) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const line = (label: string, count: Count, detail: string) => {
      const { filled, empty } = bar(count)
      return (
        <Box key={label} flexDirection="row" gap={1}>
          <Text dimColor>{label.padEnd(6)}</Text>
          <Text>
            <Text color="success">{filled}</Text>
            <Text dimColor>{empty}</Text>
          </Text>
          <Text>
            {count.done}/{count.total}
          </Text>
          <Text dimColor wrap="truncate-end">
            {detail}
          </Text>
        </Box>
      )
    }
    const summary = summarizeBatch(agents, allPlans)

    return (
      <Box flexDirection="row" gap={2}>
        <Box flexDirection="column" flexGrow={1}>
          {main.length > 0 && line('Plan', countSteps(main), currentStep(main) ?? 'done')}
          {hasAgents &&
            line(
              'Agents',
              summary,
              `${summary.running} running · ${summary.ended} finished`,
            )}
        </Box>
        <Button
          key="clear"
          label="clear"
          plain
          onPress={async () => {
            await update($, plans, ({ [MAIN]: _, ...rest }) => rest)
            if (isBatchOver(await read($, batch))) await startBatch($)
          }}
        />
      </Box>
    )
  })
}
