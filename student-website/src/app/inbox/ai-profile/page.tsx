"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

function AiProfileForm() {
  const params = useSearchParams();
  const conversationId = params.get("conversationId");
  const [name, setName] = useState("CampusOS Tutor");
  const [replyMode, setReplyMode] = useState("text_only");
  const [style, setStyle] = useState("balanced");
  const [personality, setPersonality] = useState("friendly");
  const [language, setLanguage] = useState("auto");
  const [useCourse, setUseCourse] = useState(true);
  const [saveHistory, setSaveHistory] = useState(true);
  const [speechRate, setSpeechRate] = useState("1");
  const [notes, setNotes] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      let q = supabase.from("ai_companion_profiles").select("*").eq("user_id", user.id);
      if (conversationId) q = q.eq("conversation_id", conversationId);
      const { data } = await q.maybeSingle();
      if (cancelled || !data) {
        setLoading(false);
        return;
      }
      setProfileId(data.id);
      setName(data.display_name || "CampusOS Tutor");
      setReplyMode(data.reply_mode || "text_only");
      setStyle(data.explanation_style || "balanced");
      setPersonality(data.personality || "friendly");
      setLanguage(data.language || "auto");
      setUseCourse(data.use_course_context !== false);
      setSaveHistory(data.save_history !== false);
      setSpeechRate(String(data.speech_rate ?? 1));
      setNotes(data.system_notes || "");
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!profileId) return;
    setStatus(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const payload = {
      display_name: name.trim() || "CampusOS Tutor",
      reply_mode: replyMode,
      explanation_style: style,
      personality,
      language: language.trim() || "auto",
      use_course_context: useCourse,
      save_history: saveHistory,
      speech_rate: Number(speechRate) || 1,
      system_notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("ai_companion_profiles")
      .update(payload)
      .eq("id", profileId);
    if (!error && conversationId) {
      await supabase
        .from("conversations")
        .update({ subject: payload.display_name })
        .eq("id", conversationId);
      await supabase.from("student_preferences").upsert({
        user_id: user.id,
        ai_explanation_style: style,
        updated_at: new Date().toISOString(),
      });
    }
    setStatus(error ? error.message : "Saved.");
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  return (
    <form onSubmit={onSave} className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border bg-surface p-5">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Display name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11 w-full rounded-md border border-border bg-bg px-3"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Reply mode</span>
        <select
          value={replyMode}
          onChange={(e) => setReplyMode(e.target.value)}
          className="h-11 w-full rounded-md border border-border bg-bg px-3"
        >
          <option value="text_only">Text only</option>
          <option value="voice_only">Voice only</option>
        </select>
        <span className="text-xs text-muted">You always type. AI replies with text or voice.</span>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Explanation style</span>
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          className="h-11 w-full rounded-md border border-border bg-bg px-3"
        >
          <option value="simple">Simple</option>
          <option value="balanced">Balanced</option>
          <option value="detailed">Detailed</option>
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Personality</span>
        <select
          value={personality}
          onChange={(e) => setPersonality(e.target.value)}
          className="h-11 w-full rounded-md border border-border bg-bg px-3"
        >
          <option value="friendly">Friendly</option>
          <option value="strict_tutor">Strict tutor</option>
          <option value="concise">Concise</option>
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Language</span>
        <input
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="h-11 w-full rounded-md border border-border bg-bg px-3"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={useCourse} onChange={(e) => setUseCourse(e.target.checked)} />
        Use my courses as context
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={saveHistory}
          onChange={(e) => setSaveHistory(e.target.checked)}
        />
        Save chat history
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Speech rate</span>
        <input
          value={speechRate}
          onChange={(e) => setSpeechRate(e.target.value)}
          className="h-11 w-full rounded-md border border-border bg-bg px-3"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Notes for the AI</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-border bg-bg px-3 py-2"
        />
      </label>
      <button type="submit" className="h-11 w-full rounded-full bg-fg text-sm font-semibold text-bg">
        Save
      </button>
      {status ? <p className="text-sm text-muted">{status}</p> : null}
      <Link href="/inbox" className="block text-center text-sm underline">
        Back to chats
      </Link>
    </form>
  );
}

export default function AiProfilePage() {
  return (
    <Container className="space-y-6 py-8">
      <PageHeader title="AI profile" subtitle="Name, voice/text replies, and tutor preferences" />
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <AiProfileForm />
      </Suspense>
    </Container>
  );
}
