# Pegboard

The commands and agent prompts this repo keeps reaching for. Shown by the
Pegboard extension; readable as-is without it. One `## ` per entry,
`tag: terminal | agent`, `page:` names the situations the entry belongs to,
the first fenced block is the text to copy, `{name}` is a fillable slot.
Within a page, list entries in the order you would actually do them.
Copy, don't run.

pages: Dev session, Deploy, Agent prompts

## Start the dev server
tag: terminal
page: Dev session
Replace with this repo's real command. The description is these free lines.
```bash
npm run dev
```

## Run the tests for one file
tag: terminal
page: Dev session
`{file}` is a slot: fill it in, press Copy. Values are remembered per workspace.
```bash
npm test -- {file}
```

## Resume work from a note
tag: agent
page: Dev session, Agent prompts
Paste into your agent at the start of a session. This entry sits on two pages;
the slot value is shared between them.
```
Read {note} in this repo. Summarise where it left off in three sentences, then continue from its "Next up" section. Before anything irreversible, tell me the steps and wait for my go.
```

## Push the branch
tag: terminal
page: Deploy
Write `{{` and `}}` for literal braces.
```bash
git push origin {branch}
```

## Add a pegboard entry for what I paste next
tag: agent
page: Agent prompts
Paste this, then paste the command or prompt you want on the board.
```
I am about to paste a command or an agent prompt. Add it as an entry to docs/pegboard.md in this repo: a short title, tag: terminal or agent, the page it belongs to (reuse an existing page if one fits), placed within that page in the order I would run it relative to the entries already there. Turn each value that changes per use into a {{slot}}. Show me the entry before writing it.
```

## Propose the first ten pegboard entries
tag: agent
page: Agent prompts
For a repo that has no pegboard yet.
```
Read this repo (README, scripts, package and build files, CI config, docs) and propose the first ten entries for docs/pegboard.md: the commands and agent prompts someone working here reaches for most. Group them into two to four pages named for situations ("Dev session", "Deploy"), not mechanisms. Use {{slots}} for values that change per use. Write the file in Pegboard format and show it to me before saving.
```
