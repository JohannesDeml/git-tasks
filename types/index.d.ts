export type TaskStatus = 'open' | 'inProgress'
export type Task = {
  id: string
  number: number
  status: TaskStatus
  title: string
  text: string
}

export type StepStatus = 'pending' | 'in_progress' | 'completed'
export type Step = { title: string; status: StepStatus }

// An agent of the current batch: the agents spawned since the last batch ended.
export type BatchAgent = { description: string; isEnded: boolean; isCompleted: boolean }

declare module 'claude-code' {
  interface PluginState {
    tasks: {
      // The task board (/task-board).
      tasks: Shaped<Task[]>
      marked: Shaped<string[]>
      highlight: Shaped<string>
      // Why the board shows no tasks (no config, a broken one), else ''.
      problem: Shaped<string>
      // The progress band, keyed by the loop's agent id, `main` for the main loop.
      plans: Shaped<Record<string, Step[]>>
      batch: Shaped<Record<string, BatchAgent>>
    }
  }
}
