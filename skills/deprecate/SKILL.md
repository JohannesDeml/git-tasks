---
name: deprecate
description: "Deprecate a task: mark it [DEPRECATED] and move it to .tasks/done/."
argument-hint: "<id> [reason]"
---

# Deprecate a task

Tasks are one file each, `.tasks/<state>/<P>-<n>.md` (state `open`, `inProgress` or `done`; the folder is the state), `<P>` being `taskPrefix` from `.tasks/.tasks-config.json`. Deprecated tasks are kept in `done/`, so ids have no holes. A bare number in the arguments means `<P>-<number>`.

## Instructions

1. Find the task's file (Glob `.tasks/**/<id>.md`). If it is in `done/` already or doesn't exist, tell the user and stop. If it is in `inProgress/`, say so and ask whether to deprecate it anyway (someone may be working on it).
2. Edit its first line: add ` [DEPRECATED]` right after `**<id>**` and strike through the rest of the line (`~~…~~`); add a short reason after the struck text if the user gave one, e.g. ` — replaced by <P>-X`.
3. Move it with `git mv .tasks/<state>/<id>.md .tasks/done/<id>.md`; a file git doesn't track yet (`git status` shows it `??`) is moved with plain `mv`.
4. Don't commit; confirm to the user what was deprecated.

The task to deprecate: $ARGUMENTS
