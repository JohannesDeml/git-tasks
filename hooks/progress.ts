import type { BatchAgent, Step } from '../types'

const STATUSES = ['pending', 'in_progress', 'completed'] as const
const BAR_CELLS = 10

// The tool's input, or why it is refused (the model reads that as an error).
export function parseSteps(input: unknown): Step[] | string {
  const steps = (input as { steps?: unknown } | undefined)?.steps
  if (!Array.isArray(steps) || steps.length === 0) {
    return 'steps must be a non-empty array of { title, status }'
  }
  const parsed: Step[] = []
  for (const step of steps) {
    const { title, status } = (step ?? {}) as Record<string, unknown>
    if (typeof title !== 'string' || title.trim() === '') {
      return 'every step needs a non-empty title'
    }
    if (!STATUSES.includes(status as Step['status'])) {
      return `status must be one of ${STATUSES.join(', ')}`
    }
    parsed.push({ title: title.trim(), status: status as Step['status'] })
  }
  return parsed
}

export type Count = { done: number; total: number }

export function countSteps(steps: readonly Step[]): Count {
  return {
    done: steps.filter(step => step.status === 'completed').length,
    total: steps.length,
  }
}

export function isFinished(steps: readonly Step[]): boolean {
  return steps.every(step => step.status === 'completed')
}

// The step being worked on, else the next one up.
export function currentStep(steps: readonly Step[]): string | undefined {
  return (
    steps.find(step => step.status === 'in_progress') ??
    steps.find(step => step.status === 'pending')
  )?.title
}

export function bar({ done, total }: Count): { filled: string; empty: string } {
  const filled = total === 0 ? 0 : Math.round((done / total) * BAR_CELLS)
  return { filled: '▰'.repeat(filled), empty: '▱'.repeat(BAR_CELLS - filled) }
}

export type BatchSummary = Count & { running: number; ended: number }

// Steps of every agent in the batch. A completed agent counts as finished
// even if it never ticked its last step off; one without a plan counts as a
// single step, so the bar still moves as agents finish.
export function summarizeBatch(
  batch: Readonly<Record<string, BatchAgent>>,
  plans: Readonly<Record<string, readonly Step[]>>,
): BatchSummary {
  const summary = { done: 0, total: 0, running: 0, ended: 0 }
  for (const [id, agent] of Object.entries(batch)) {
    const plan = plans[id] ?? []
    const total = Math.max(plan.length, 1)
    summary.total += total
    summary.done += agent.isCompleted ? total : countSteps(plan).done
    summary[agent.isEnded ? 'ended' : 'running'] += 1
  }
  return summary
}

export function isBatchOver(batch: Readonly<Record<string, BatchAgent>>): boolean {
  return Object.values(batch).every(agent => agent.isEnded)
}
