---
name: implement
description: "Implement one or more tasks from .tasks/ with one commit per task: a single task directly in this session (so the user sees every step), several each in its own agent so the main session's context stays small. Takes ids as a list and/or ranges, e.g. `PRJ-151`, `PRJ-151, PRJ-153`, `PRJ-145 - PRJ-155`, `PRJ-145..PRJ-155`, `145-155`."
argument-hint: "<P>-145 - <P>-155, <P>-160"
---

# Implement tasks

Tasks are one file each, `.tasks/<state>/<P>-<n>.md`; the folder is the state: `open/` → `inProgress/` while this skill works on it → `done/` in the commit that finishes it. `<P>` is `taskPrefix` from `.tasks/.tasks-config.json` (none: point to `/tasks:init` and stop). Plans, notes and mockups for a task live in `.plans/<ID>/`. **What "done" means for this project** (tests, linters, formatting, commit rules) comes from its instructions (CLAUDE.md, AGENTS.md, CONTRIBUTING.md), not from this skill.

**One task to do** (after step 2): implement it directly in this session, no agent (step 3a): the user wants to follow the steps and reasoning as they happen.

**Several tasks**: the main session only plans, launches agents one after another, checks their commits and summarizes (step 3b). All reading, coding and testing happens inside the agents. **Don't read task bodies, code or test output in the main session** — that is exactly the context this skill exists to save.

## 1. Parse the ids

`$ARGUMENTS` lists task ids in any mix of:
- single ids: `<P>-151`, or a bare number `151` (→ `<P>-151`);
- separators: commas, spaces, `and`/`und`;
- inclusive ranges: `<P>-145 - <P>-155`, `<P>-145–<P>-155`, `<P>-145-155`, `<P>-145..<P>-155`, `145-155`.

Expand ranges ascending, keep the order as written otherwise, drop duplicates. If nothing parses, say so and stop.

## 2. Check status (cheaply)

One Glob of `.tasks/**/<P>-*.md` shows where each id lives, and one Grep for `depends on` over the to-do files shows dependencies (don't read the whole files). Then sort the ids into:
- **to do**: in `open/`; or in `inProgress/` — then say so in the plan: an earlier run left it partial (its file ends with a status note), or another session is on it; go ahead unless the user stops you;
- **skipped**: in `done/` (done or deprecated), or not found. Ids missing inside a range are normal (gaps) — list them briefly; an explicitly named id that is missing is worth a clear note.

**Order**: as given, except that a task moves after another task of this batch it `depends on`. A dependency that is still open and not in the batch: note it in the plan and in that agent's prompt, and go ahead.

**Working tree**: `git status --short`. If anything besides untracked files is modified or staged, tell the user what's there and ask whether to commit it first, or proceed and leave it out of the agents' commits. Don't start on a dirty tree without that answer. New task files in `.tasks/open/` (untracked) are the user's work in progress: leave them alone.

Show the plan in a few lines (order, skipped ids with the reason, open dependencies), then start right away — no confirmation needed.

**Progress band**: with several tasks, report the batch with `mcp__tasks__report_progress` (if the tool is there), one step per task (`<ID> <short title>`), and update it as each agent starts and returns; the band's Agents line then shows the running agent's own steps.

## 3a. One task: implement it here

Follow points 1–8 of the agent prompt in 3b yourself, with `<ID>`, `<ROOT>` and `<TRAILER>` filled in, with two differences: the user is present, so ask (`AskUserQuestion`) when a choice is a real blocker rather than stopping; and write a one-line progress note before each phase (reading, red tests, implementation, checks, commit), reporting those phases with `mcp__tasks__report_progress` as in point 3. Then check the commit as in 3b, publish HTML files for the user as in 3b, and finish with the agent's reply shape instead of the step-4 table. Skip step 4.

## 3b. Several tasks: one agent per task, strictly in sequence

For each task: launch a `general-purpose` agent in the foreground (`run_in_background: false` — the next task builds on this one's commit; never two agents at a time). Use the prompt below with `<ID>` filled in, `<ROOT>` the repository's absolute root, plus the open-dependency note if any, and the commit attribution this session was given (copy it verbatim into `<TRAILER>`; none given: drop that part).

> You are implementing task **<ID>** in the repository at `<ROOT>`. You run unattended: nobody can answer questions until you're done.
>
> 1. **Start**: move the task to in progress, `git mv .tasks/open/<ID>.md .tasks/inProgress/<ID>.md` (if `git status` shows the file `??`, untracked, use plain `mv`); skip this if it is in `inProgress/` already. Leave every other file in `.tasks/` alone: new tasks may appear there while you work.
> 2. **Read** the project's instructions (`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, whichever exist, from the root down to the folders you touch) and follow them: conventions, shell rules, testing, formatting, commit rules — they win over this prompt where they differ. Read the task in `.tasks/inProgress/<ID>.md`; if `.plans/<ID>/` exists, read what's there (research notes, mockups).
> 3. **Implement** it, test-first where the project has tests: failing tests → minimal implementation → refactor. Before you finish, meet the project's **definition of done** (its checks: tests, analyzers, linters, formatter). If its instructions name none, run the test and lint commands its build config clearly defines and report that the definition of done is missing. If the tool `mcp__tasks__report_progress` exists, report your progress with it: once you have read the task, send your steps (e.g. read task, red tests, implementation, checks, commit, with the task's own sub-tasks where it has several), then update the list whenever a step starts or finishes.
> 4. **Open decisions** ("decide …", options to weigh): pick what fits the task's goal, the project's instructions and the existing code best, and note each choice for the report. Stop only for a real blocker (the task contradicts the code, needs something this environment can't do, or a choice would be hard to undo).
> 5. **Out of reach** (devices, simulators, network access, credentials, visual checks): don't attempt them; list them as follow-ups for the user.
> 6. **Write-ups**: if the task asks for a write-up or mockup for the user to look at, write it as a file (an HTML page in `.plans/<ID>/` unless the task names another place; load the `artifact-design` skill first if it exists) and list its path. Don't publish it. Follow-up tasks it proposes stay **in the write-up**: don't create task files for them until the owner has reviewed it and asks for them.
> 7. **Finish**: update the project's instructions where the task changes what they describe (keep them condensed). Then, by outcome:
>    - **done**: `git mv .tasks/inProgress/<ID>.md .tasks/done/<ID>.md` (a file never committed: `mv`, then `git add .tasks/done/<ID>.md`);
>    - **partial** (a useful, working part is done): leave the task in `inProgress/` and end its file with a line `**Status (<YYYY-MM-DD>):** <what is done, what is missing>`; it goes into the commit, so the next run picks up from there;
>    - **blocked**: commit nothing; move the task back (`git mv .tasks/inProgress/<ID>.md .tasks/open/<ID>.md`, or `mv` if untracked), and leave the working tree as you found it.
> 8. **Commit** once (done or partial): stage only the files you changed, by path (never `git add -A`/`.`), including the task file's move. Use the commit flags the project's instructions name; never skip hooks or signing on your own — if the commit fails on them, report blocked and leave the changes staged. Message: the project's convention if it has one (see its instructions and `git log`), else first line `<ID> <imperative summary, ≤ 72 chars>`, a blank line, a short wrapped body saying what changed and why. Then a blank line and exactly `<TRAILER>`. Don't push.
>
> Reply in at most ~250 words, in this shape:
> - **Status:** done / partial (what's missing) / blocked (why)
> - **Commit:** short hash and first line, or "none"
> - **What changed:** 2–4 bullets
> - **Decisions made:** each open choice and what you picked
> - **Boy-scout findings:** up to three inconsistencies noticed in the code you read (report, don't fix), one line each
> - **Follow-ups for the user:** or "none"
> - **Files for the user:** paths, or "none"

After each agent returns, check only `git status --short` (clean apart from what was there before) and `git log -1 --format="%h %s"` (names the task id). Then:
- **done**: tell the user in one line (task, commit, one-phrase summary) and start the next.
- **partial with a commit, or blocked with a clean tree** (the task back in `open/`): note it and go on, but skip later tasks of this batch that depend on it.
- **anything left uncommitted, or no commit for a "done"**: stop the batch and tell the user; don't clean up on your own.

If an agent listed **files for the user** that are HTML pages and the Artifact tool is available, publish each after it returns (load `artifact-design` first if this session hasn't) and keep the links for the summary.

## 4. Summary

| Task | Status | Commit | Notes |
|---|---|---|---|

Below the table: the **decisions the agents made** (per task — the user may want to revisit them), the **follow-ups for the user** collected from all tasks, the **boy-scout findings** (merged, at most five overall, most relevant first), artifact links, and the skipped ids with reasons. Mention that nothing was pushed.
