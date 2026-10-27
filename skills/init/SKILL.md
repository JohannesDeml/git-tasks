---
name: init
description: "Set up the file-based task workflow in this repository: .tasks/{open,inProgress,done}, .tasks/.tasks-config.json with the task prefix, and .plans/. Optional argument: the prefix, e.g. `PRJ`."
argument-hint: "PRJ"
---

# Set up tasks in this repository

All paths are relative to the repository root (`git rev-parse --show-toplevel`).

1. **Already set up?** If `.tasks/.tasks-config.json` exists, show its prefix and what's missing of the steps below, add only that, and stop.
2. **Prefix**: `$ARGUMENTS` if given, else ask (`AskUserQuestion`), proposing two or three short uppercase abbreviations of the repository's name. It must match `^[A-Za-z][A-Za-z0-9]*$` (no dash: ids are `<prefix>-<n>`).
3. **Folders and config**: write, with the Write tool,
   - `.tasks/.tasks-config.json`: `{ "taskPrefix": "<prefix>" }` (2-space indent, final newline);
   - an empty `.gitkeep` in each of `.tasks/open/`, `.tasks/inProgress/`, `.tasks/done/` (git keeps no empty folders);
   - `.plans/.gitkeep`.
4. **Existing tickets**: if the repository already keeps tickets elsewhere (a `backlog/` folder, `TODO.md`, …), say so and offer to migrate them as a separate step; don't move anything unasked.
5. **`.gitignore`**: ask whether plans stay local (research notes, mockups, write-ups that are only for the owner). If yes, add a line `/.plans/` (and remove `.plans/.gitkeep` again). Tasks themselves are always tracked.
6. **CLAUDE.md**: offer to add this section (create the file if there is none), with the prefix filled in:

   ```markdown
   ## Tasks

   One file per task, `.tasks/<state>/<P>-<n>.md`; the folder is the state: `open/`, `inProgress/` (an `/tasks:implement` run is on it), `done/` (done or deprecated). Ids are permanent and never reused; the next is the highest in all three folders + 1 (`/tasks:add`). Plans, notes and mockups for a task go to `.plans/<P>-<n>/`. `/task-board` picks open tasks for `/tasks:implement`.

   **Definition of done** (what `/tasks:implement` checks before it commits):
   - <the checks, e.g. `npm test` green, `npm run lint` clean, formatter run>
   - <commit rules, e.g. signed commits, message style>
   ```

   Ask the user for the definition of done (or derive it from the repository's scripts, CI config or README and let them confirm): `/tasks:implement` relies on it and has no project knowledge of its own.
7. Don't commit. Report what was created and that `/tasks:add <description>` adds the first task.
