import type { Register } from 'claude-code'

import { BOARD_COMMAND, CREATE_TOOL, registerBoard } from './board'
import { PROGRESS_TOOL, registerProgress } from './progress-band'

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register(BOARD_COMMAND)
    await $.tool.register(CREATE_TOOL)
    await $.tool.register(PROGRESS_TOOL)
    return next(e)
  })
  registerBoard(on, options)
  registerProgress(on, options)
}
