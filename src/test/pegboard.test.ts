import { test } from "node:test";
import * as assert from "node:assert/strict";
import { parsePegboard, render, extractSlots, groupEntries, parsePageOrder } from "../pegboard";

const F = "```";
const SAMPLE = `# Pegboard for this repo

Some preamble that is not an entry.

## Start dev servers
tag: terminal
Both servers, detached.
${F}bash
./dev.sh start
${F}

## Set a password on the VM
tag: terminal
Prompts twice, hidden. Logs the user out everywhere.
${F}
cd ~/git/lingual_lab/backend_server && ../venv/bin/python scripts/set_password.py {username}
${F}

## Resume from a note
tag: agent
${F}
Read docs/notes/{note}.md and continue from "Next up". Literal braces: {{keep}}.
${F}

## Not an entry (no template)
tag: terminal
Just words.

## Start dev servers
${F}
duplicate title gets a distinct id
${F}
`;

test("parses entries, tags, descriptions, templates, slots", () => {
  const e = parsePegboard(SAMPLE);
  assert.equal(e.length, 4);
  assert.deepEqual(e.map((x) => x.id), ["start-dev-servers", "set-a-password-on-the-vm", "resume-from-a-note", "start-dev-servers-2"]);
  assert.equal(e[0].tag, "terminal");
  assert.equal(e[0].description, "Both servers, detached.");
  assert.equal(e[0].template, "./dev.sh start");
  assert.deepEqual(e[0].slots, []);
  assert.deepEqual(e[1].slots, ["username"]);
  assert.equal(e[2].tag, "agent");
  assert.deepEqual(e[2].slots, ["note"]); // {{keep}} is not a slot
  assert.equal(e[3].tag, "terminal"); // default
});

test("render fills slots, leaves empty ones visible, honours {{ }} escapes", () => {
  const t = "python set_password.py {username} # {{literal}} {missing}";
  assert.equal(render(t, { username: "admin" }), "python set_password.py admin # {literal} {missing}");
  assert.equal(render(t, {}), "python set_password.py {username} # {literal} {missing}");
});

test("placeholders need identifier characters (JSON keys and {1} are not slots)", () => {
  assert.deepEqual(extractSlots('curl -d \'{"username":"a"}\' -w "%{http_code}" {host}'), ["http_code", "host"]);
  assert.deepEqual(extractSlots("echo {1} {a-b} {ok_1}"), ["ok_1"]);
});

test("empty or preamble-only files yield no entries", () => {
  assert.deepEqual(parsePegboard(""), []);
  assert.deepEqual(parsePegboard("# Title\n\nwords\n"), []);
});

test("page: lines are parsed; groups are pages in order of first mention, plus Other", () => {
  const md = `## A
tag: terminal
page: Deploy, Storage
${F}
a
${F}

## B
tag: agent
pages: Storage
${F}
b
${F}

## C
${F}
c
${F}
`;
  const e = parsePegboard(md);
  assert.deepEqual(e.map((x) => x.pages), [["Deploy", "Storage"], ["Storage"], []]);
  assert.equal(e[0].description, ""); // page line is not description
  const g = groupEntries(e);
  assert.deepEqual(g.map((x) => [x.key, x.title, x.kind, x.entries.map((y) => y.id)]), [
    ["page-deploy", "Deploy", "page", ["a"]],
    ["page-storage", "Storage", "page", ["a", "b"]],
    ["page-other", "Other", "page", ["c"]],
  ]);
});

test("without any page: lines, groups fall back to Terminal / Agent prompts", () => {
  const g = groupEntries(parsePegboard(SAMPLE));
  assert.deepEqual(g.map((x) => [x.key, x.entries.length]), [["tag-terminal", 3], ["tag-agent", 1]]);
});

test("a preamble pages: line fixes the page order; unnamed pages follow", () => {
  const md = `# Pegboard
pages: Storage, Deploy

## A
page: Deploy
${F}
a
${F}

## B
page: VM, Storage
${F}
b
${F}
`;
  assert.deepEqual(parsePageOrder(md), ["Storage", "Deploy"]);
  assert.deepEqual(parsePageOrder("## A\npage: X\n```\na\n```\n"), []); // entry lines don't count
  const g = groupEntries(parsePegboard(md), parsePageOrder(md));
  assert.deepEqual(g.map((x) => x.title), ["Storage", "Deploy", "VM"]);
});
