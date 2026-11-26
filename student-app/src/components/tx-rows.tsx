import { View } from "react-native";
import { Group, ListRow } from "@/src/components/page";
import { AppText } from "@/src/components/ui";
import { formatNaira } from "@/src/lib/campus";
import { dayLabel, statusText, timeLabel, TYPE_ICON, type Tx } from "@/src/lib/transactions";

function Row({ tx, showDay }: { tx: Tx; showDay: boolean }) {
  const credit = tx.amount > 0;
  const extra = statusText(tx);
  const when = showDay ? `${dayLabel(tx.at)} · ${timeLabel(tx.at)}` : timeLabel(tx.at);
  return (
    <ListRow
      icon={TYPE_ICON[tx.type]}
      title={tx.title}
      subtitle={`${tx.subtitle} · ${when}${extra ? ` · ${extra}` : ""}`}
      value={`${credit ? "+" : "-"}${formatNaira(Math.abs(tx.amount))}`}
      valueTone={tx.status === "failed" ? "danger" : credit ? "success" : "neutral"}
    />
  );
}

/** A plain list (used for the latest few on the wallet). */
export function TxList({ rows }: { rows: Tx[] }) {
  return (
    <Group>
      {rows.map((tx) => (
        <Row key={tx.id} tx={tx} showDay />
      ))}
    </Group>
  );
}

/** The full list, split under day headings. */
export function TxGrouped({ rows }: { rows: Tx[] }) {
  const days: { label: string; items: Tx[] }[] = [];
  for (const tx of rows) {
    const label = dayLabel(tx.at);
    const last = days[days.length - 1];
    if (last && last.label === label) last.items.push(tx);
    else days.push({ label, items: [tx] });
  }
  return (
    <View style={{ gap: 14 }}>
      {days.map((d) => (
        <View key={d.label} style={{ gap: 8 }}>
          <AppText muted size={12} weight="700">
            {d.label.toUpperCase()}
          </AppText>
          <Group>
            {d.items.map((tx) => (
              <Row key={tx.id} tx={tx} showDay={false} />
            ))}
          </Group>
        </View>
      ))}
    </View>
  );
}
