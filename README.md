# Pegboard

**Your repo's commands and agent prompts, on the wall. Copy, don't run.**

> **Status: under development.** Not yet published to the VS Code Marketplace or
> Open VSX. The extension works today when installed from source (see
> [Developing](#developing)); the file format may still change before 0.1.0.

Pegboard is a VS Code / Cursor extension that reads one markdown file in the
open repo, `docs/pegboard.md`, and shows its entries in a sidebar and a page.
Each entry is a terminal command or an agent prompt with fillable `{slots}` and
one button: **Copy**. Fill the slots, copy, paste into the terminal or your
agent. Pegboard never runs anything.

The image is a workshop pegboard: everything visible at once, take a tool down,
use it, hang it back. The board never changes. An entry is a peg.

## The file

One `## ` heading per entry. Text before the first heading is ignored, except
an optional `pages:` line that fixes the page order.

    pages: Dev session, Deploy

    ## Start dev servers
    tag: terminal
    page: Dev session
    Both servers, detached; logs under .dev/.
    ```bash
    ./dev.sh start
    ```

    ## Resume work from a note
    tag: agent
    page: Dev session, Deploy
    Paste into your agent at the start of a session.
    ```
    Read {note} and continue from "Next up".
    ```

- `tag: terminal` (default) or `tag: agent` sets the icon and label.
- `page: A, B` names the situations the entry belongs to ("Deploy", "Storage").
  Pages are the sidebar groups and the sections of the board. An entry may sit
  on several pages. Within a page, entries keep file order, so write them in
  the order you would actually do them and a page reads as a short checklist.
  Entries with no `page:` land on "Other". If no entry has a `page:` at all,
  the board is grouped by tag instead.
- `pages: A, B, C` in the preamble fixes the page order. Otherwise pages appear
  in order of first mention.
- Free lines before the code fence are the description.
- The first fenced block is the text to copy. `{name}` is a slot (letters,
  digits, underscore). Write `{{` and `}}` for literal braces.
- Slot values are remembered per workspace. The same entry on two pages shares
  its values.

The file is plain markdown, so it reads fine on GitHub or in an editor without
the extension.

## Getting started

1. Install Pegboard. Until it is published, that means from source:
   `npm install && ./install.sh` in a clone of this repo.
2. Click the Pegboard icon in the activity bar.
3. Press **Create docs/pegboard.md**. The starter file shows every feature and
   ships two agent prompts that fill the board for you: "Add a pegboard entry
   for what I paste next" and "Propose the first ten pegboard entries".

**Pegboard: Add entry** appends a skeleton entry to the file. The setting
`pegboard.file` changes the file location (default `docs/pegboard.md`).

## Why copy-only

Pasting keeps a human in the loop for exactly one keystroke. That is the whole
design: the board can hold `sudo`, SSH, deploy and delete commands without
being able to run any of them. Agent prompts are first-class entries next to
commands because in a real situation you reach for both. There will not be a
Run button.

## Developing

```bash
npm install
npm test            # compiles, then runs the parser tests with node --test
npm run package     # builds pegboard.vsix
./install.sh        # package and install into Cursor + VS Code found on this machine
```

Or press F5 in VS Code to launch an Extension Development Host.

## License

MIT.
