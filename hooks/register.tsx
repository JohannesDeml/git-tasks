import type { Register } from 'claude-code'

import { registerBoard, startBoard } from './board'
import { registerProgress, startProgress } from './progress-band'

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await startBoard($)
    await startProgress($)
    return next(e)
  })
  registerBoard(on, options)
  registerProgress(on, options)
}
