# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

Pegboard: a public VS Code / Cursor extension. It reads `docs/pegboard.md`
from the open repo and shows the entries (terminal commands and agent prompts
with `{slots}`) in a sidebar and a page with one action: Copy. It never runs
anything. See `README.md`.

## Commands

```bash
npm install
npm test            # tsc, then node --test on out/test/
npm run package     # pegboard.vsix
./install.sh        # package + install into Cursor and VS Code found locally
```

`src/pegboard.ts` is the parser and has no VS Code imports, so it is unit
tested with plain node. `src/extension.ts` is the tree, the webview and the
commands. `resources/starter.md` is what the welcome action writes into a
repo that has no pegboard yet; keep it a working example of every feature.

## Docs go to the private notes repo

`docs/` here is a symlink to `~/git/project-notes/pegboard/docs/` and is
gitignored. **Every plan, design, worklog, conversation write-up or decision
goes under `docs/`** (so it lands in the private notes repo), in the usual
places: `docs/plans/`, `docs/designs/`, `docs/worklog/`,
`docs/conversations/`, `docs/DECISIONS.md`. Use the prefix
`yymmddhh_<slug>.md`. Read the latest worklog there before starting a session.
Nothing under `docs/` is ever committed to this public repo; if a doc should
ship publicly, the owner will say so and it goes elsewhere (for example the
README).

## Conventions

- Copy-only is the identity. Decline "add a Run button" (DECISIONS.md D1).
- Public repo: nothing from the owner's other repos crosses over. No hostnames,
  buckets, VM commands, or real pegboard files from private projects. The only
  sample content is `resources/starter.md`, which is generic.
- Renamed from a private extension called "shelf". Do not reintroduce that
  name in ids, settings, or file names.
- Never commit `.env`, tokens (Marketplace PAT, Open VSX token), or `*.vsix`.
