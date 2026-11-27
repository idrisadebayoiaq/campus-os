// A small markdown reader for the AI tutor's replies: headings, quotes, lists, tables,
// fenced diagrams (flow / mindmap) and code. Kept dependency-free on purpose.

export type ListItem = { text: string; depth: number; n?: string };

export type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "quote"; text: string }
  | { t: "ul"; items: ListItem[] }
  | { t: "ol"; items: ListItem[] }
  | { t: "table"; head: string[]; rows: string[][]; align: ("left" | "center" | "right")[] }
  | { t: "code"; lang: string; text: string }
  | { t: "hr" };

const FENCE = /^\s*```\s*([\w-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,4})\s+(.*?)\s*#*\s*$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const BULLET = /^(\s*)[-*•]\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,2})[.)]\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line: string) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s
    .replace(/\\\|/g, "\u0000")
    .split("|")
    .map((c) => c.replace(/\u0000/g, "|").trim());
}

function isTableStart(lines: string[], i: number) {
  return lines[i].includes("|") && i + 1 < lines.length && lines[i + 1].includes("-") && TABLE_SEP.test(lines[i + 1]);
}

function startsBlock(lines: string[], i: number) {
  const l = lines[i];
  return (
    FENCE.test(l) || HEADING.test(l) || HR.test(l) || QUOTE.test(l) || BULLET.test(l) || ORDERED.test(l) || isTableStart(lines, i)
  );
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence
      blocks.push({ t: "code", lang: fence[1].toLowerCase(), text: body.join("\n").replace(/\s+$/, "") });
      continue;
    }

    if (isTableStart(lines, i)) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) => {
        const l = c.startsWith(":");
        const r = c.endsWith(":");
        return (l && r ? "center" : r ? "right" : "left") as "left" | "center" | "right";
      });
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        const cells = splitRow(lines[i++]);
        while (cells.length < head.length) cells.push("");
        rows.push(cells.slice(0, head.length));
      }
      blocks.push({ t: "table", head, rows, align });
      continue;
    }

    const h = line.match(HEADING);
    if (h) {
      blocks.push({ t: "h", level: h[1].length, text: h[2] });
      i++;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) quoted.push(lines[i++].match(QUOTE)![1]);
      blocks.push({ t: "quote", text: quoted.join("\n").trim() });
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line) && !BULLET.test(line);
      const items: ListItem[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        const b = cur.match(BULLET);
        const o = cur.match(ORDERED);
        if (ordered && o) {
          items.push({ text: o[3], depth: Math.min(2, Math.floor(o[1].length / 2)), n: o[2] });
        } else if (!ordered && b) {
          items.push({ text: b[2], depth: Math.min(2, Math.floor(b[1].length / 2)) });
        } else if (cur.trim() && /^\s{2,}\S/.test(cur) && items.length && !startsBlock(lines, i)) {
          items[items.length - 1].text += `\n${cur.trim()}`; // wrapped line of the item above
        } else if (!ordered && o && /^\s{2,}/.test(cur)) {
          items.push({ text: o[3], depth: 1 });
        } else if (ordered && b && /^\s{2,}/.test(cur)) {
          items.push({ text: b[2], depth: 1 });
        } else {
          break;
        }
        i++;
      }
      blocks.push({ t: ordered ? "ol" : "ul", items });
      continue;
    }

    const para: string[] = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) para.push(lines[i++].trim());
    blocks.push({ t: "p", text: para.join("\n") });
  }
  return blocks;
}

export type Span = { text: string; bold?: boolean; italic?: boolean; code?: boolean; strike?: boolean };

const INLINE = /\*\*(.+?)\*\*|__(.+?)__|`([^`\n]+)`|~~(.+?)~~|\*(\S(?:[^*\n]*?\S)?)\*/g;

export function parseInline(text: string, base: Omit<Span, "text"> = {}): Span[] {
  const out: Span[] = [];
  let last = 0;
  INLINE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), ...base });
    if (m[1] !== undefined || m[2] !== undefined) out.push(...parseInline(m[1] ?? m[2], { ...base, bold: true }));
    else if (m[3] !== undefined) out.push({ text: m[3], ...base, code: true });
    else if (m[4] !== undefined) out.push(...parseInline(m[4], { ...base, strike: true }));
    else if (m[5] !== undefined) out.push(...parseInline(m[5], { ...base, italic: true }));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), ...base });
  return out;
}

/** Plain text of a reply, for inbox previews and read-aloud. */
export function stripMarkdown(source: string) {
  return parseBlocks(source)
    .map((b) => {
      switch (b.t) {
        case "h":
        case "p":
        case "quote":
          return parseInline(b.text).map((s) => s.text).join("");
        case "ul":
        case "ol":
          return b.items.map((it, k) => `${b.t === "ol" ? `${it.n ?? k + 1}.` : "•"} ${parseInline(it.text).map((s) => s.text).join("")}`).join("\n");
        case "table":
          return [b.head, ...b.rows].map((r) => r.map((c) => parseInline(c).map((s) => s.text).join("")).join(", ")).join(". ");
        case "code":
          return b.lang === "flow" || b.lang === "diagram" || b.lang === "mindmap" ? b.text.replace(/\s*(->|→|=>)\s*/g, ", then ") : b.text;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n\n");
}
