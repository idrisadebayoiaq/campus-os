import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText, Button, Card, EmptyState } from "@/src/components/ui";
import {
  AddForm,
  Row,
  StudyShell,
  SyncBanner,
  confirmDelete,
} from "@/src/components/study";
import { CACHE_KEYS, getCached, isLocalId, scopedKey, setCached } from "@/src/lib/offline";
import type { Flashcard, FlashcardDeck } from "@/src/lib/study";
import { useStudyTable } from "@/src/lib/use-study-table";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function FlashcardsScreen() {
  const colors = useTheme();
  // local deck id -> server id, so queued cards can sync after their deck does
  const idMap = useRef<Record<string, string>>({});

  const decks = useStudyTable<FlashcardDeck>({
    table: "flashcard_decks",
    cacheKey: CACHE_KEYS.flashcardDecks,
    onSynced: async (localDeckId, row, userId) => {
      idMap.current[localDeckId] = row.id;
      const key = scopedKey(CACHE_KEYS.flashcards, userId);
      const cached = await getCached<Flashcard[]>(key, []);
      await setCached(
        key,
        cached.map((c) => (c.deck_id === localDeckId ? { ...c, deck_id: row.id } : c)),
      );
    },
  });
  const cards = useStudyTable<Flashcard>({
    table: "flashcards",
    cacheKey: CACHE_KEYS.flashcards,
    enabled: decks.synced,
    prepareInsert: (row) => {
      const deckId = idMap.current[String(row.deck_id)] ?? String(row.deck_id);
      if (isLocalId(deckId)) return null;
      return { deck_id: deckId, front: row.front, back: row.back };
    },
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [addingDeck, setAddingDeck] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [studying, setStudying] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const resolve = (id: string) => idMap.current[id] ?? id;
  const deck = selected
    ? decks.items.find((d) => d.id === resolve(selected) || d.id === selected)
    : undefined;
  const deckCards = deck
    ? cards.items.filter((c) => resolve(c.deck_id) === deck.id || c.deck_id === deck.id)
    : [];

  const banner = (
    <SyncBanner
      offline={decks.offline || cards.offline}
      pending={decks.pendingCount + cards.pendingCount}
      error={decks.error ?? cards.error}
    />
  );

  if (deck) {
    const card = deckCards[Math.min(index, Math.max(deckCards.length - 1, 0))];
    return (
      <StudyShell
        title={deck.title}
        subtitle={`${deckCards.length} card${deckCards.length === 1 ? "" : "s"}`}
        banner={banner}
        refreshing={cards.refreshing}
        onRefresh={cards.refresh}
      >
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            title="All decks"
            variant="secondary"
            onPress={() => {
              setSelected(null);
              setStudying(false);
              setAddingCard(false);
            }}
            style={{ flex: 1 }}
          />
          <Button
            title={studying ? "Done" : "Study"}
            disabled={deckCards.length === 0}
            onPress={() => {
              setStudying((s) => !s);
              setIndex(0);
              setFlipped(false);
            }}
            style={{ flex: 1 }}
          />
        </View>

        {studying && card ? (
          <View style={{ gap: 12 }}>
            <Pressable
              onPress={() => setFlipped((f) => !f)}
              style={{
                backgroundColor: flipped ? colors.surface : colors.heroBg,
                borderRadius: radii.xl,
                minHeight: 220,
                padding: 24,
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <AppText
                size={12}
                weight="600"
                style={{ color: flipped ? colors.muted : colors.heroMuted }}
              >
                {flipped ? "ANSWER" : "QUESTION"} · tap to flip
              </AppText>
              <AppText
                size={22}
                weight="700"
                style={{
                  color: flipped ? colors.fg : colors.heroFg,
                  textAlign: "center",
                }}
              >
                {flipped ? card.back : card.front}
              </AppText>
            </Pressable>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <Button
                title="Previous"
                variant="secondary"
                disabled={index === 0}
                onPress={() => {
                  setIndex((i) => Math.max(0, i - 1));
                  setFlipped(false);
                }}
                style={{ flex: 1 }}
              />
              <AppText muted size={13}>
                {index + 1}/{deckCards.length}
              </AppText>
              <Button
                title="Next"
                disabled={index >= deckCards.length - 1}
                onPress={() => {
                  setIndex((i) => Math.min(deckCards.length - 1, i + 1));
                  setFlipped(false);
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : addingCard ? (
          <AddForm
            fields={[
              { key: "front", label: "Question", type: "multiline", required: true },
              { key: "back", label: "Answer", type: "multiline", required: true },
            ]}
            onCancel={() => setAddingCard(false)}
            onSubmit={async (draft) => {
              const res = await cards.add({ ...draft, deck_id: deck.id });
              if (!res.error) setAddingCard(false);
              return res.error;
            }}
          />
        ) : (
          <Button title="Add card" variant="secondary" onPress={() => setAddingCard(true)} />
        )}

        {!studying && deckCards.length === 0 ? (
          <EmptyState title="No cards yet" description="Add questions and answers to study this deck." />
        ) : null}
        {!studying ? (
          <View style={{ gap: 10 }}>
            {deckCards.map((c) => (
              <Row
                key={c.id}
                pending={c._pending}
                info={{ title: c.front, subtitle: c.back }}
                onDelete={() =>
                  confirmDelete("this card", async () => {
                    await cards.remove(c.id);
                  })
                }
              />
            ))}
          </View>
        ) : null}
      </StudyShell>
    );
  }

  return (
    <StudyShell
      title="Flashcards"
      subtitle="Decks for quick recall"
      banner={banner}
      refreshing={decks.refreshing}
      onRefresh={() => {
        void decks.refresh();
        void cards.refresh();
      }}
    >
      <View
        style={{
          backgroundColor: colors.heroBg,
          borderRadius: radii.xl,
          padding: 20,
          gap: 4,
        }}
      >
        <AppText size={13} style={{ color: colors.heroMuted }}>
          {decks.items.length} deck{decks.items.length === 1 ? "" : "s"}
        </AppText>
        <AppText size={20} weight="700" style={{ color: colors.heroFg }}>
          Study with spaced recall
        </AppText>
        <AppText size={13} style={{ color: colors.heroMuted }}>
          Decks sync when you’re online.
        </AppText>
      </View>

      {addingDeck ? (
        <AddForm
          fields={[{ key: "title", label: "Deck title", placeholder: "CSC 201 definitions", required: true }]}
          onCancel={() => setAddingDeck(false)}
          onSubmit={async (draft) => {
            const res = await decks.add(draft);
            if (!res.error) setAddingDeck(false);
            return res.error;
          }}
        />
      ) : (
        <Button title="New deck" onPress={() => setAddingDeck(true)} />
      )}

      {decks.loading ? null : decks.items.length === 0 ? (
        <EmptyState title="No decks yet" description="Create a deck, then add flashcards to it." />
      ) : (
        <View style={{ gap: 12 }}>
          {decks.items.map((d) => {
            const count = cards.items.filter(
              (c) => resolve(c.deck_id) === d.id || c.deck_id === d.id,
            ).length;
            return (
              <Row
                key={d.id}
                pending={d._pending}
                info={{
                  title: d.title,
                  subtitle: `${count} card${count === 1 ? "" : "s"}`,
                  onPress: () => {
                    setSelected(d.id);
                    setIndex(0);
                  },
                }}
                onDelete={() =>
                  confirmDelete(d.title, async () => {
                    await decks.remove(d.id);
                  })
                }
              />
            );
          })}
        </View>
      )}
      <Card style={{ backgroundColor: colors.soft }}>
        <AppText muted size={12}>
          Decks and cards are stored on this device and sync when you're online.
        </AppText>
      </Card>
    </StudyShell>
  );
}
