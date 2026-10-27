# git-tasks - Simple file-based task management for Claude Code

* Each task is a markdown file in your repo, avoids merge conflicts with multiple agents running in parallel
* Folder structure defines the state of the task (Open, in Progress, Done)
* Simple skills to add, implement, and show all tasks in claude code
* Works great with an agentic setup as well as a simple internal ticketing system for small(er) projects
* No need to install anything, just add the plugin to claude code or follow the pattern

Tasks are Markdown files in your repository, one per task, and the folder a task sits in is its state. Claude adds tasks, lets you pick them from a pane, implements them with one commit each and moves them from folder to folder. Everything lives in git: no issue tracker or service is involved.

```
.tasks/
├── .tasks-config.json   { "taskPrefix": "PRJ" }
├── open/                PRJ-12.md …
├── inProgress/          what /tasks:implement is working on (or left partial)
└── done/                done and deprecated tasks, kept so ids have no holes
.plans/<ID>/             research notes, mockups, write-ups for a task (normally gitignored)
```

A task file starts with `**PRJ-12** — **Short title.** Description…` and may go on with bullets or paragraphs. Dependencies end the first paragraph: ` — depends on PRJ-3; related to PRJ-7`. The prefix (`PRJ` here) is set per repository in `.tasks/.tasks-config.json`.

## What's in it

| | |
|---|---|
| `/tasks:init [prefix]` | Sets up `.tasks/`, the config and `.plans/`, offers a `.gitignore` line and a "Tasks" section for CLAUDE.md with the project's definition of done. |
| `/tasks:add <text>` | Writes a new task to `open/` with the next free id (via the `mcp__tasks__create` tool, so no race and no shell scripts). |
| `/tasks:deprecate <id> [reason]` | Marks a task `[DEPRECATED]`, strikes it through and moves it to `done/`. |
| `/tasks:implement <ids>` | Implements tasks, one commit each: one task in the session, several with one agent per task in sequence. `open/ → inProgress/` at the start, `→ done/` in the finishing commit; a partial result stays in `inProgress/` with a status line, a blocked task goes back to `open/`. Ids can be lists and ranges: `PRJ-4, PRJ-7`, `PRJ-10..PRJ-15`, `10-15`. |
| `/task-board` | A pane listing the open and in-progress tasks with the highlighted one's text beside them: ↑/↓ move, Enter marks, `i` fills the prompt with `/tasks:implement <marked ids>` (not sent), `q`/Esc close. |
| progress band | The tool `mcp__tasks__report_progress`: a band above the prompt with the plan's progress and the combined steps of running agents. `/tasks:implement` uses it; any task can. |

## Your project's side

`/tasks:implement` knows nothing about your stack. It reads the project's instructions (CLAUDE.md, AGENTS.md, CONTRIBUTING.md) for the **definition of done**: which tests, linters and formatters must pass, commit flags and message style. Put those there; `/tasks:init` offers a template.

## Install

In Claude Code:

```
/plugin install tasks --marketplace johannesDeml/git-tasks
```

Answer `y` to add the marketplace, pick a scope (user scope makes it available in every repository), then run `/tasks:init` in a repository to set it up.

From a terminal instead:

```
claude plugin install tasks --marketplace johannesDeml/git-tasks
```

**Without access to GitHub from where Claude Code runs** (e.g. a firewalled dev container): check the repository out into your project on a machine that has access, for example as a submodule:

```
git submodule add https://github.com/johannesDeml/git-tasks tools/claude-plugins/tasks
```

Then, where Claude Code runs (inside the container), add the checkout as a local marketplace and install from it:

```
claude plugin marketplace add ./tools/claude-plugins/tasks --scope project
claude plugin install tasks@tasks --scope project
```

This writes the checkout's absolute path to `.claude/settings.json`, so run it inside the container, not on the host. To load the checkout for one session without installing, start `claude --plugin-dir tools/claude-plugins/tasks`. Not `.claude/skills/`: Claude Code reads only standalone `SKILL.md` folders there, not plugins.

## Development

- `claude plugin test .` runs the tests (pure logic in `hooks/tasks.ts` and `hooks/progress.ts`; the pane, the create tool and the band through the engine).
- `claude plugin validate .` checks the manifests and the hooks module.
- `claude --plugin-dir .` starts a session with this working copy loaded.
