/**
 * Pegboard file parser and template rendering. No VS Code imports, so it can be
 * unit-tested with plain node.
 *
 * Format (docs/pegboard.md):
 *
 *   ## Title of the entry
 *   tag: terminal            <- or "agent"; default terminal
 *   page: Deploy, VM         <- optional; the pages this entry belongs to
 *   One or two lines saying what it is for.
 *   ```
 *   the {placeholder} text to copy
 *   ```
 *
 * Placeholders are `{name}` (identifier characters only). Write `{{` / `}}`
 * for literal braces. Anything before the first `## ` is ignored.
 *
 * A page is a situation ("Deploy", "Storage"), and its entries are listed in
 * file order, which should be the order you would actually do them. The same
 * entry may sit on several pages. Pages appear in order of first mention,
 * unless a `pages: A, B, C` line in the preamble (before the first `## `)
 * fixes the order; pages not named there follow, then "Other".
 */

export type Tag = "terminal" | "agent";

export interface Entry {
  id: string;
  title: string;
  tag: Tag;
  pages: string[];
  description: string;
  template: string;
  slots: string[];
}

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
// Private-use code points stand in for escaped braces during rendering.
const OPEN = "\uE000";
const CLOSE = "\uE001";

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "entry";
}

export function extractSlots(template: string): string[] {
  const seen = new Set<string>();
  for (const m of template.replace(/\{\{|\}\}/g, "").matchAll(PLACEHOLDER)) seen.add(m[1]);
  return [...seen];
}

/** Fill placeholders; empty/missing values leave `{name}` visible so the gap is obvious. */
export function render(template: string, values: Record<string, string>): string {
  return template
    .replace(/\{\{/g, OPEN).replace(/\}\}/g, CLOSE)
    .replace(PLACEHOLDER, (whole, name: string) => (values[name] ? values[name] : whole))
    .replace(new RegExp(OPEN, "g"), "{").replace(new RegExp(CLOSE, "g"), "}");
}

/** Page order declared in the preamble (`pages: A, B, C`), or [] if none. */
export function parsePageOrder(markdown: string): string[] {
  const preamble = markdown.split(/^## +/m)[0];
  const m = preamble.match(/^pages?:\s*(.*)$/im);
  return m ? m[1].split(",").map((x) => x.trim()).filter(Boolean) : [];
}

export function parsePegboard(markdown: string): Entry[] {
  const entries: Entry[] = [];
  const ids = new Set<string>();
  const sections = markdown.split(/^## +/m).slice(1); // drop preamble
  for (const section of sections) {
    const lines = section.split(/\r?\n/);
    const title = (lines.shift() || "").trim();
    if (!title) continue;
    let tag: Tag = "terminal";
    const pages: string[] = [];
    const desc: string[] = [];
    let template: string | null = null;
    let inFence = false;
    const fenceLines: string[] = [];
    for (const line of lines) {
      if (inFence) {
        if (/^```/.test(line)) { inFence = false; template = fenceLines.join("\n"); }
        else fenceLines.push(line);
        continue;
      }
      if (template === null && /^```/.test(line)) { inFence = true; continue; }
      const tagMatch = line.match(/^tag:\s*(\w+)\s*$/i);
      if (tagMatch) { tag = tagMatch[1].toLowerCase() === "agent" ? "agent" : "terminal"; continue; }
      const pageMatch = line.match(/^pages?:\s*(.*)$/i);
      if (pageMatch) {
        for (const name of pageMatch[1].split(",").map((x) => x.trim()).filter(Boolean)) {
          if (!pages.includes(name)) pages.push(name);
        }
        continue;
      }
      if (template === null && line.trim()) desc.push(line.trim());
    }
    if (inFence) template = fenceLines.join("\n"); // unterminated fence: take what we have
    if (template === null) continue; // no template = not an entry
    let id = slugify(title);
    let n = 2;
    while (ids.has(id)) id = `${slugify(title)}-${n++}`;
    ids.add(id);
    entries.push({ id, title, tag, pages, description: desc.join(" "), template, slots: extractSlots(template) });
  }
  return entries;
}

export interface Group {
  key: string;      // stable id for the group (used in DOM ids and tree nodes)
  title: string;
  kind: "page" | "tag";
  entries: Entry[];
}

export const OTHER_PAGE = "Other";

/**
 * How the sidebar and the page are organised. If any entry names a page, the
 * groups are the pages (in order of first mention) plus "Other" for entries
 * that name none. If no entry names a page, fall back to Terminal / Agent
 * prompts by tag.
 */
export function groupEntries(entries: Entry[], declaredOrder: string[] = []): Group[] {
  if (entries.some((e) => e.pages.length)) {
    const mentioned = new Set(entries.flatMap((e) => e.pages));
    const order: string[] = declaredOrder.filter((p) => mentioned.has(p));
    for (const e of entries) for (const p of e.pages) if (!order.includes(p)) order.push(p);
    const groups = order.map((title) => ({
      key: "page-" + slugify(title), title, kind: "page" as const,
      entries: entries.filter((e) => e.pages.includes(title)),
    }));
    const rest = entries.filter((e) => !e.pages.length);
    if (rest.length) groups.push({ key: "page-other", title: OTHER_PAGE, kind: "page", entries: rest });
    return groups;
  }
  const byTag = (tag: Tag, title: string): Group => ({ key: "tag-" + tag, title, kind: "tag", entries: entries.filter((e) => e.tag === tag) });
  return [byTag("terminal", "Terminal"), byTag("agent", "Agent prompts")].filter((g) => g.entries.length);
}
