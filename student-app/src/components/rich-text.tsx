import { Ionicons } from "@expo/vector-icons";
import { memo, useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { parseBlocks, parseInline, type Block } from "@/src/lib/markdown";
import { useTheme } from "@/src/theme/ThemeProvider";

type Palette = ReturnType<typeof useTheme>;

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

function Inline({ text, size = 15, weight, color, c }: { text: string; size?: number; weight?: "400" | "600" | "700"; color?: string; c: Palette }) {
  const spans = useMemo(() => parseInline(text), [text]);
  return (
    <>
      {spans.map((s, i) => (
        <Text
          key={i}
          style={[
            { color: color ?? c.fg, fontSize: size, lineHeight: size * 1.5 },
            weight ? { fontWeight: weight } : null,
            s.bold ? { fontWeight: "700" } : null,
            s.italic ? { fontStyle: "italic" } : null,
            s.strike ? { textDecorationLine: "line-through" } : null,
            s.code ? { fontFamily: MONO, fontSize: size - 1, backgroundColor: c.accentSoft, color: c.fg } : null,
          ]}
        >
          {s.text}
        </Text>
      ))}
    </>
  );
}

function plainLength(text: string) {
  return parseInline(text)
    .map((s) => s.text)
    .join("").length;
}

function Table({ block, c }: { block: Extract<Block, { t: "table" }>; c: Palette }) {
  const cols = block.head.length;
  const widths = block.head.map((h, ci) => {
    const longest = Math.max(plainLength(h), ...block.rows.map((r) => plainLength(r[ci] ?? "")));
    return Math.max(64, Math.min(200, longest * 7.4 + 22));
  });
  const row = (cells: string[], kind: "head" | "body", ri: number) => (
    <View
      key={`${kind}${ri}`}
      style={[
        styles.tr,
        {
          backgroundColor: kind === "head" ? c.accentSoft : ri % 2 ? c.surface : "transparent",
          borderTopColor: c.border,
          borderTopWidth: kind === "head" ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      {cells.slice(0, cols).map((cell, ci) => (
        <View
          key={ci}
          style={[
            styles.td,
            { width: widths[ci], borderLeftColor: c.border, borderLeftWidth: ci ? StyleSheet.hairlineWidth : 0 },
          ]}
        >
          <Text style={{ textAlign: block.align[ci] ?? "left" }}>
            <Inline text={cell} size={13} weight={kind === "head" ? "700" : undefined} c={c} />
          </Text>
        </View>
      ))}
    </View>
  );
  return (
    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <View style={[styles.table, { borderColor: c.border }]}>
        {row(block.head, "head", 0)}
        {block.rows.map((r, ri) => row(r, "body", ri))}
      </View>
    </ScrollView>
  );
}

const ARROW = /\s*(?:-{1,2}>|=>|→)\s*/;

function Flow({ text, c }: { text: string; c: Palette }) {
  const chains = text
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s+/, "").trim())
    .filter(Boolean)
    .map((l) => l.split(ARROW).map((s) => s.trim()).filter(Boolean));
  return (
    <View style={{ gap: 14 }}>
      {chains.map((chain, ci) => (
        <View key={ci} style={{ alignItems: "center" }}>
          {chain.map((node, ni) => (
            <View key={ni} style={{ alignItems: "center", alignSelf: "stretch" }}>
              {ni > 0 ? <Ionicons name="arrow-down" size={18} color={c.muted} style={{ marginVertical: 2 }} /> : null}
              <View
                style={[
                  styles.node,
                  ni === 0
                    ? { backgroundColor: c.inverseBg, borderColor: c.inverseBg }
                    : ni === chain.length - 1 && chain.length > 1
                      ? { backgroundColor: c.accentSoft, borderColor: c.accent }
                      : { backgroundColor: c.surface, borderColor: c.border },
                ]}
              >
                <Text
                  style={{
                    color: ni === 0 ? c.inverseFg : c.fg,
                    fontSize: 13.5,
                    lineHeight: 19,
                    fontWeight: ni === 0 || ni === chain.length - 1 ? "700" : "500",
                    textAlign: "center",
                  }}
                >
                  {node}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Mindmap({ text, c }: { text: string; c: Palette }) {
  const rows = text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const indent = (l.match(/^\s*/)?.[0].length ?? 0) + (/^\s*[-*•]\s/.test(l) ? 0 : 0);
      return { depth: Math.floor(indent / 2), text: l.replace(/^\s*[-*•]\s+/, "").trim() };
    });
  const base = rows.length ? Math.min(...rows.map((r) => r.depth)) : 0;
  return (
    <View style={{ gap: 6 }}>
      {rows.map((r, i) => {
        const depth = r.depth - base;
        return (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", marginLeft: depth * 18 }}>
            {depth > 0 ? <View style={{ width: 12, height: 1.5, backgroundColor: c.accent, marginRight: 4 }} /> : null}
            <View
              style={[
                styles.node,
                {
                  alignSelf: "flex-start",
                  flexShrink: 1,
                  paddingVertical: depth === 0 ? 8 : 5,
                  backgroundColor: depth === 0 ? c.inverseBg : depth === 1 ? c.accentSoft : c.surface,
                  borderColor: depth === 0 ? c.inverseBg : depth === 1 ? c.accent : c.border,
                },
              ]}
            >
              <Text
                style={{
                  color: depth === 0 ? c.inverseFg : c.fg,
                  fontSize: depth === 0 ? 14.5 : 13,
                  lineHeight: 18,
                  fontWeight: depth <= 1 ? "700" : "500",
                }}
              >
                {r.text}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function BlockView({ block, c, first }: { block: Block; c: Palette; first: boolean }) {
  const top = first ? 0 : 10;
  switch (block.t) {
    case "h": {
      const size = block.level === 1 ? 18 : block.level === 2 ? 16.5 : 15.5;
      return (
        <View style={{ marginTop: first ? 0 : 14, marginBottom: 2 }}>
          <Text>
            <Inline text={block.text} size={size} weight="700" c={c} />
          </Text>
          {block.level <= 2 ? <View style={[styles.rule, { backgroundColor: c.accent }]} /> : null}
        </View>
      );
    }
    case "p":
      return (
        <Text style={{ marginTop: top }}>
          <Inline text={block.text} c={c} />
        </Text>
      );
    case "quote":
      return (
        <View style={[styles.quote, { marginTop: top, borderLeftColor: c.accent, backgroundColor: c.accentSoft }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={c.muted} style={{ marginTop: 3 }} />
          <Text style={{ flex: 1 }}>
            <Inline text={block.text} size={14.5} c={c} />
          </Text>
        </View>
      );
    case "ul":
    case "ol":
      return (
        <View style={{ marginTop: top, gap: 5 }}>
          {block.items.map((it, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8, marginLeft: it.depth * 16 }}>
              {block.t === "ol" ? (
                <View style={[styles.num, { backgroundColor: c.accentSoft }]}>
                  <Text style={{ color: c.fg, fontSize: 11.5, fontWeight: "700" }}>{it.n ?? i + 1}</Text>
                </View>
              ) : (
                <View style={[styles.dot, { backgroundColor: it.depth ? "transparent" : c.accent, borderColor: c.accent }]} />
              )}
              <Text style={{ flex: 1 }}>
                <Inline text={it.text} c={c} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "table":
      return (
        <View style={{ marginTop: top }}>
          <Table block={block} c={c} />
        </View>
      );
    case "hr":
      return <View style={{ marginTop: 12, height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
    case "code": {
      if (block.lang === "flow" || block.lang === "diagram" || block.lang === "flowchart") {
        return (
          <View style={[styles.panel, { marginTop: top, borderColor: c.border, backgroundColor: c.bg }]}>
            <Flow text={block.text} c={c} />
          </View>
        );
      }
      if (block.lang === "mindmap" || block.lang === "tree") {
        return (
          <View style={[styles.panel, { marginTop: top, borderColor: c.border, backgroundColor: c.bg }]}>
            <Mindmap text={block.text} c={c} />
          </View>
        );
      }
      return (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: top, flexGrow: 0 }}
          contentContainerStyle={[styles.panel, { borderColor: c.border, backgroundColor: c.bg }]}
        >
          <Text style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 18, color: c.fg }}>{block.text}</Text>
        </ScrollView>
      );
    }
  }
}

/** Renders the tutor's reply with clear spacing, quotes, tables and diagrams. */
function RichTextBase({ text }: { text: string }) {
  const c = useTheme();
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <View>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} c={c} first={i === 0} />
      ))}
    </View>
  );
}

export const RichText = memo(RichTextBase);

const styles = StyleSheet.create({
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, overflow: "hidden" },
  tr: { flexDirection: "row" },
  td: { paddingHorizontal: 8, paddingVertical: 7, justifyContent: "center" },
  node: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  panel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12 },
  quote: {
    flexDirection: "row",
    gap: 8,
    borderLeftWidth: 4,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  rule: { height: 2, width: 36, borderRadius: 1, marginTop: 4 },
  num: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, marginTop: 8 },
});
