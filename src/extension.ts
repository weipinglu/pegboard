import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Entry, Group, groupEntries, parsePageOrder, parsePegboard, render } from "./pegboard";

const SETTING = "pegboard.file";
const STATE_KEY = "pegboard.values"; // { [entryId]: { [slot]: value } }

type Values = Record<string, Record<string, string>>;

// ---------------------------------------------------------------------------
// Pegboard file discovery and loading
// ---------------------------------------------------------------------------

function boardRel(): string {
  return vscode.workspace.getConfiguration().get<string>(SETTING, "docs/pegboard.md");
}

function boardPath(): string | undefined {
  const rel = boardRel();
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const p = path.join(folder.uri.fsPath, rel);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function loadGroups(): { entries: Entry[]; groups: Group[] } {
  const p = boardPath();
  if (!p) return { entries: [], groups: [] };
  try {
    const md = fs.readFileSync(p, "utf8");
    const entries = parsePegboard(md);
    return { entries, groups: groupEntries(entries, parsePageOrder(md)) };
  } catch (err) {
    vscode.window.showErrorMessage(`Pegboard: could not read ${p}: ${(err as Error).message}`);
    return { entries: [], groups: [] };
  }
}

// ---------------------------------------------------------------------------
// Sidebar tree: groups (pages, or Terminal / Agent when no pages) -> entries
// ---------------------------------------------------------------------------

class Node extends vscode.TreeItem {
  constructor(public readonly group: Group, public readonly entry: Entry | null) {
    super(entry ? entry.title : group.title,
      entry ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded);
    if (entry) {
      this.contextValue = "entry";
      const md = new vscode.MarkdownString();
      if (entry.description) md.appendMarkdown(entry.description + "\n\n");
      md.appendCodeblock(entry.template, entry.tag === "terminal" ? "bash" : "text");
      this.tooltip = md;
      this.description = entry.slots.length ? "{" + entry.slots.join("} {") + "}" : undefined;
      this.command = { command: "pegboard.open", title: "Open", arguments: [sectionId(group, entry)] };
      this.iconPath = new vscode.ThemeIcon(entry.tag === "agent" ? "comment-discussion" : "terminal");
    } else {
      this.contextValue = "group";
      this.iconPath = new vscode.ThemeIcon(
        group.kind === "page" ? "window" : group.key === "tag-agent" ? "hubot" : "terminal-bash");
    }
  }
}

/** One section per (group, entry): the same entry may appear on several pages. */
function sectionId(group: Group, entry: Entry): string { return `${group.key}/${entry.id}`; }

class PegboardTree implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  entries: Entry[] = [];
  groups: Group[] = [];

  refresh(): void {
    ({ entries: this.entries, groups: this.groups } = loadGroups());
    this._onDidChange.fire();
  }
  getTreeItem(n: Node): vscode.TreeItem { return n; }
  getChildren(n?: Node): Node[] {
    if (!n) return this.groups.map((g) => new Node(g, null));
    if (n.entry) return [];
    return n.group.entries.map((e) => new Node(n.group, e));
  }
}

// ---------------------------------------------------------------------------
// The page (webview): one section per group, inputs for slots, one Copy button each
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

class PegboardPage {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly context: vscode.ExtensionContext, private readonly tree: PegboardTree) {}

  private values(): Values { return this.context.workspaceState.get<Values>(STATE_KEY, {}); }

  show(focusId?: string): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel("pegboard.page", "Pegboard", vscode.ViewColumn.Active, {
        enableScripts: true,
        retainContextWhenHidden: true,
      });
      this.panel.onDidDispose(() => { this.panel = undefined; });
      this.panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === "copy") {
          await vscode.env.clipboard.writeText(msg.text);
          vscode.window.setStatusBarMessage(`$(copy) Copied: ${msg.title}`, 3000);
        } else if (msg.type === "values") {
          const all = this.values();
          all[msg.id] = msg.values;
          await this.context.workspaceState.update(STATE_KEY, all);
        } else if (msg.type === "edit") {
          vscode.commands.executeCommand("pegboard.openFile");
        }
      });
    }
    this.panel.webview.html = this.html(this.tree.groups, this.values());
    this.panel.reveal();
    if (focusId) this.panel.webview.postMessage({ type: "focus", id: focusId });
  }

  refresh(): void {
    if (this.panel) this.panel.webview.html = this.html(this.tree.groups, this.values());
  }

  private html(groups: Group[], values: Values): string {
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const esc = escapeHtml;
    const nav = groups.length > 1
      ? `<nav class="pages">${groups.map((g) => `<a href="#${esc(g.key)}">${esc(g.title)}</a>`).join("")}</nav>` : "";
    const group = (g: Group) => {
      return `<h2 id="${esc(g.key)}">${esc(g.title)}</h2>` + g.entries.map((e) => {
        const v = values[e.id] ?? {};
        const inputs = e.slots.map((s) =>
          `<label>${esc(s)} <input data-slot="${esc(s)}" value="${esc(v[s] ?? "")}" spellcheck="false"></label>`).join("");
        const tpl = JSON.stringify(e.template).replace(/</g, "\\u003c");
        const kind = e.tag === "agent" ? "agent prompt" : "terminal";
        return `<section class="entry" id="${esc(sectionId(g, e))}" data-id="${esc(e.id)}">
  <div class="head"><h3>${esc(e.title)}</h3><span class="kind">${kind}</span><button class="copy" title="Copy to clipboard">Copy</button></div>
  ${e.description ? `<p class="desc">${esc(e.description)}</p>` : ""}
  ${inputs ? `<div class="slots">${inputs}</div>` : ""}
  <pre class="out"></pre>
  <script type="application/json" class="tpl">${tpl}</script>
</section>`;
      }).join("");
    };
    const file = boardPath();
    const body = groups.length
      ? nav + groups.map(group).join("")
      : "<p>No entries. Create <code>docs/pegboard.md</code> (see the Pegboard README).</p>";
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0 1.2rem 3rem; max-width: 900px; }
  h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: .06em; opacity: .7; margin: 1.6rem 0 .4rem; }
  .entry { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: .6rem .9rem; margin: .5rem 0; }
  .entry.focus { outline: 2px solid var(--vscode-focusBorder); }
  .head { display: flex; align-items: center; gap: .8rem; }
  .head h3 { margin: 0; font-size: .95rem; flex: 1; }
  .head .kind { font-size: .7rem; opacity: .55; text-transform: uppercase; letter-spacing: .05em; }
  nav.pages { display: flex; flex-wrap: wrap; gap: .3rem 1rem; margin-top: .8rem; font-size: .85rem; }
  nav.pages a { text-decoration: none; }
  .desc { margin: .3rem 0 .4rem; opacity: .8; font-size: .85rem; }
  .slots { display: flex; flex-wrap: wrap; gap: .6rem; margin: .3rem 0 .5rem; }
  .slots label { font-size: .8rem; opacity: .85; display: flex; flex-direction: column; gap: .15rem; }
  input { font-family: var(--vscode-editor-font-family); background: var(--vscode-input-background); color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px; padding: .2rem .4rem; min-width: 12rem; }
  pre.out { font-family: var(--vscode-editor-font-family); font-size: .85rem; background: var(--vscode-textCodeBlock-background);
            padding: .5rem .7rem; border-radius: 4px; white-space: pre-wrap; word-break: break-all; margin: 0; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px;
           padding: .3rem .7rem; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.done { background: var(--vscode-testing-iconPassed, #3a3); }
  .topbar { display: flex; justify-content: space-between; align-items: baseline; margin-top: 1rem; }
  .topbar small { opacity: .6; }
  a { color: var(--vscode-textLink-foreground); cursor: pointer; }
</style></head><body>
<div class="topbar"><h1 style="font-size:1.2rem;margin:0">Pegboard</h1><small>${file ? esc(file) : "no pegboard file"} &middot; <a id="edit">edit</a></small></div>
${body}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const PH = /\\{([A-Za-z_][A-Za-z0-9_]*)\\}/g;
  function render(tpl, values) {
    return tpl.replace(/\\{\\{/g, "\\uE000").replace(/\\}\\}/g, "\\uE001")
      .replace(PH, (w, n) => values[n] ? values[n] : w)
      .replace(/\\uE000/g, "{").replace(/\\uE001/g, "}");
  }
  const sections = [...document.querySelectorAll("section.entry")];
  const updaters = new Map(); // entry id -> [update fn per copy]
  for (const sec of sections) {
    const tpl = JSON.parse(sec.querySelector("script.tpl").textContent);
    const out = sec.querySelector("pre.out");
    const inputs = [...sec.querySelectorAll("input[data-slot]")];
    const values = () => Object.fromEntries(inputs.map(i => [i.dataset.slot, i.value]));
    const update = () => { out.textContent = render(tpl, values()); };
    const id = sec.dataset.id;
    if (!updaters.has(id)) updaters.set(id, []);
    updaters.get(id).push({ inputs, update });
    inputs.forEach(i => i.addEventListener("input", () => {
      const v = values();
      // The same entry on another page shares its values.
      for (const other of updaters.get(id)) {
        if (other.inputs !== inputs) other.inputs.forEach(o => { o.value = v[o.dataset.slot] ?? ""; });
        other.update();
      }
      vscode.postMessage({ type: "values", id, values: v });
    }));
    update();
    const btn = sec.querySelector("button.copy");
    btn.addEventListener("click", () => {
      vscode.postMessage({ type: "copy", text: out.textContent, title: sec.querySelector("h3").textContent });
      btn.textContent = "Copied"; btn.classList.add("done");
      setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("done"); }, 1200);
    });
  }
  document.getElementById("edit")?.addEventListener("click", () => vscode.postMessage({ type: "edit" }));
  window.addEventListener("message", (ev) => {
    if (ev.data?.type === "focus") {
      document.querySelectorAll(".focus").forEach(el => el.classList.remove("focus"));
      const el = document.getElementById(ev.data.id);
      if (el) { el.classList.add("focus"); el.scrollIntoView({ behavior: "smooth", block: "center" }); const f = el.querySelector("input"); if (f) f.focus(); }
    }
  });
</script></body></html>`;
  }
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  const tree = new PegboardTree();
  const page = new PegboardPage(context, tree);
  tree.refresh();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("pegboard.entries", tree),
    vscode.commands.registerCommand("pegboard.open", (id?: string) => page.show(id)),
    vscode.commands.registerCommand("pegboard.refresh", () => { tree.refresh(); page.refresh(); }),
    vscode.commands.registerCommand("pegboard.openFile", async () => {
      const existing = boardPath();
      if (existing) { await vscode.window.showTextDocument(vscode.Uri.file(existing)); return; }
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) { vscode.window.showWarningMessage("Pegboard: open a folder first."); return; }
      const target = path.join(folder.uri.fsPath, boardRel());
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(context.extensionPath, "resources", "starter.md"), target);
      await vscode.window.showTextDocument(vscode.Uri.file(target));
    }),
    vscode.commands.registerCommand("pegboard.addEntry", async () => {
      let target = boardPath();
      if (!target) {
        await vscode.commands.executeCommand("pegboard.openFile");
        target = boardPath();
        if (!target) return;
      }
      const skeleton = "\n## New entry\ntag: terminal\npage: Other\nWhat it is for.\n```\necho {name}\n```\n";
      fs.appendFileSync(target, skeleton);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
      const editor = await vscode.window.showTextDocument(doc);
      const line = doc.lineCount - 7; // the "## New entry" heading
      const range = new vscode.Range(line, 3, line, doc.lineAt(line).text.length);
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }),
    vscode.commands.registerCommand("pegboard.copy", async (node?: Node) => {
      const entry = node?.entry;
      if (!entry) return;
      const values = context.workspaceState.get<Values>(STATE_KEY, {})[entry.id] ?? {};
      await vscode.env.clipboard.writeText(render(entry.template, values));
      vscode.window.setStatusBarMessage(`$(copy) Copied: ${entry.title}`, 3000);
    }),
    vscode.commands.registerCommand("pegboard.readme", () => {
      vscode.commands.executeCommand("markdown.showPreview", vscode.Uri.file(path.join(context.extensionPath, "README.md")));
    }),
  );

  // Live reload when the pegboard file (in any workspace folder) changes.
  const watcher = vscode.workspace.createFileSystemWatcher(`**/${boardRel()}`);
  const reload = () => { tree.refresh(); page.refresh(); };
  watcher.onDidChange(reload);
  watcher.onDidCreate(reload);
  watcher.onDidDelete(reload);
  context.subscriptions.push(
    watcher,
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(SETTING)) reload(); }),
  );
}

export function deactivate(): void {}
