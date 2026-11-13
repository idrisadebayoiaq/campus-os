"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Deck = { id: string; title: string; course_id: string | null };
type Card = {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  ease: number;
  interval_days: number;
  due_at: string;
};

type CourseOpt = { id: string; code: string };

function nextInterval(days: number, ease: number, remembered: boolean) {
  if (!remembered) return { interval_days: 0, ease: Math.max(1.3, ease - 0.2) };
  const next = days < 1 ? 1 : Math.round(days * ease);
  return { interval_days: next, ease: Math.min(3, ease + 0.1) };
}

export function FlashcardsPanel({
  decks,
  cards,
  courses,
}: {
  decks: Deck[];
  cards: Card[];
  courses: CourseOpt[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [activeDeck, setActiveDeck] = useState<string | null>(decks[0]?.id ?? null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const dueCards = useMemo(() => {
    const now = Date.now();
    return cards
      .filter((c) => (!activeDeck || c.deck_id === activeDeck) && new Date(c.due_at).getTime() <= now)
      .sort((a, b) => a.due_at.localeCompare(b.due_at));
  }, [cards, activeDeck]);

  const current = dueCards[reviewIndex];

  async function createDeck(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const courseId = String(form.get("course_id") || "") || null;
    const { error } = await supabase.from("flashcard_decks").insert({
      user_id: user.id,
      course_id: courseId,
      title: String(form.get("title")),
    });
    setStatus(error ? error.message : "Deck created.");
    if (!error) {
      e.currentTarget.reset();
      router.refresh();
    }
  }

  async function addCard(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const deckId = String(form.get("deck_id"));
    const { error } = await supabase.from("flashcards").insert({
      user_id: user.id,
      deck_id: deckId,
      front: String(form.get("front")),
      back: String(form.get("back")),
    });
    setStatus(error ? error.message : "Card added.");
    if (!error) {
      e.currentTarget.reset();
      router.refresh();
    }
  }

  async function grade(remembered: boolean) {
    if (!current) return;
    const supabase = createClient();
    const { interval_days, ease } = nextInterval(
      current.interval_days,
      Number(current.ease),
      remembered,
    );
    const due = new Date();
    due.setDate(due.getDate() + interval_days);
    await supabase
      .from("flashcards")
      .update({ interval_days, ease, due_at: due.toISOString() })
      .eq("id", current.id);
    setFlipped(false);
    setReviewIndex(0);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-medium">Decks</h2>
        <div className="flex flex-wrap gap-2">
          {decks.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                setActiveDeck(d.id);
                setReviewIndex(0);
                setFlipped(false);
              }}
              className={`rounded-md border px-3 py-2 text-sm ${activeDeck === d.id ? "border-fg bg-surface" : "border-border"}`}
            >
              {d.title}
            </button>
          ))}
          {!decks.length ? <p className="text-sm text-muted">Create a deck below.</p> : null}
        </div>
        <form onSubmit={createDeck} className="flex flex-wrap gap-2 rounded-md border border-border p-4">
          <Input name="title" placeholder="Deck title" required className="min-w-[180px] flex-1" />
          <select name="course_id" className="h-11 rounded-md border border-border bg-bg px-3 text-sm">
            <option value="">No course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
          <Button type="submit">New deck</Button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Add card</h2>
        <form onSubmit={addCard} className="grid gap-2 rounded-md border border-border p-4 sm:grid-cols-2">
          <select name="deck_id" required className="h-11 rounded-md border border-border bg-bg px-3 text-sm sm:col-span-2">
            <option value="">Pick deck</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
          <Input name="front" placeholder="Front" required />
          <Input name="back" placeholder="Back" required />
          <Button type="submit">Add card</Button>
        </form>
      </section>

      <section className="space-y-3 rounded-md border border-border p-5">
        <h2 className="font-medium">Review ({dueCards.length} due)</h2>
        {current ? (
          <>
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="min-h-32 w-full rounded-md border border-dashed border-border p-4 text-left text-sm"
            >
              {flipped ? current.back : current.front}
            </button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => grade(false)}>
                Forgot
              </Button>
              <Button type="button" onClick={() => grade(true)}>
                Remembered
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">No cards due. Add cards or check back later.</p>
        )}
      </section>

      {status ? <p className="text-sm text-muted">{status}</p> : null}
    </div>
  );
}
