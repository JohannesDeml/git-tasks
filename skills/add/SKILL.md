---
name: add
description: "Add a new task to .tasks/open/ with the next free id."
argument-hint: "<what the task is about>"
---

# Add a task

Tasks are one file each, `.tasks/<state>/<P>-<n>.md` (state `open`, `inProgress` or `done`; the folder is the state), `<P>` being `taskPrefix` from `.tasks/.tasks-config.json`. Ids are permanent and never reused. If there is no config, say so and point to `/tasks:init`; stop.

## Instructions

1. **Write the task** from `$ARGUMENTS`:
   - a **short title** (one line, no final period needed);
   - a **description** in Markdown: what and why first; longer tasks continue with bullet lists or paragraphs on the following lines. Keep the user's intent; don't invent requirements.
   - If it depends on other tasks, end the first paragraph with ` — depends on <P>-X, <P>-Y`; related tasks with `; related to <P>-Z`.
2. **Create it** with the tool `mcp__tasks__create` (`title`, `description`). It picks the next id over all three folders and writes `.tasks/open/<id>.md` as `**<id>** — **<Title>.** <description>`.
   - Without that tool (the plugin's mod isn't loaded): Glob `.tasks/**/<P>-*.md`, take the highest number + 1, and write the file in exactly that format with the Write tool. Never overwrite an existing file: if it exists, someone added a task meanwhile; count again.
3. Don't commit; confirm to the user what was added (id and title).

The task to add: $ARGUMENTS
