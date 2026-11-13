"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Group = {
  id: string;
  title: string;
  course_code: string;
  description: string | null;
};

type Post = {
  id: string;
  group_id: string;
  body: string;
  created_at: string;
};

export function GroupsPanel({
  groups,
  memberships,
  posts,
  campusId,
}: {
  groups: Group[];
  memberships: string[];
  posts: Post[];
  campusId?: string | null;
}) {
  const router = useRouter();
  const [activeGroup, setActiveGroup] = useState<string | null>(groups[0]?.id ?? null);
  const [status, setStatus] = useState<string | null>(null);

  const groupPosts = posts.filter((p) => p.group_id === activeGroup);

  async function createGroup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("study_groups")
      .insert({
        campus_id: campusId || null,
        course_code: String(form.get("course_code")).toUpperCase(),
        title: String(form.get("title")),
        description: String(form.get("description") || "") || null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      setStatus(error.message);
      return;
    }
    await supabase.from("study_group_members").insert({
      group_id: data.id,
      user_id: user.id,
      role: "owner",
    });
    setStatus("Group created.");
    e.currentTarget.reset();
    router.refresh();
  }

  async function join(groupId: string) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("study_group_members").insert({
      group_id: groupId,
      user_id: user.id,
    });
    setStatus(error ? error.message : "Joined group.");
    if (!error) router.refresh();
  }

  async function post(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeGroup) return;
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("study_group_posts").insert({
      group_id: activeGroup,
      user_id: user.id,
      body: String(form.get("body")),
    });
    setStatus(error ? error.message : "Posted.");
    if (!error) {
      e.currentTarget.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={createGroup} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
        <Field label="Course code">
          <Input name="course_code" required placeholder="CSC 201" />
        </Field>
        <Field label="Group title">
          <Input name="title" required placeholder="CSC 201 night prep" />
        </Field>
        <Field label="Description">
          <Input name="description" className="sm:col-span-2" />
        </Field>
        <Button type="submit">Create group</Button>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="divide-y divide-border rounded-md border border-border">
          {groups.length ? (
            groups.map((g) => (
              <div key={g.id} className="px-4 py-3 text-sm">
                <button type="button" className="text-left font-medium" onClick={() => setActiveGroup(g.id)}>
                  {g.title} · {g.course_code}
                </button>
                <p className="text-muted">{g.description}</p>
                {!memberships.includes(g.id) ? (
                  <Button type="button" variant="secondary" className="mt-2 h-9" onClick={() => join(g.id)}>
                    Join
                  </Button>
                ) : (
                  <p className="mt-1 text-xs text-muted">Member</p>
                )}
              </div>
            ))
          ) : (
            <p className="px-4 py-6 text-sm text-muted">No groups yet.</p>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="font-medium">Posts</h2>
          <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {groupPosts.length ? (
              groupPosts.map((p) => (
                <div key={p.id} className="px-4 py-3 text-sm">
                  <p className="whitespace-pre-wrap">{p.body}</p>
                  <p className="text-xs text-muted">{new Date(p.created_at).toLocaleString()}</p>
                </div>
              ))
            ) : (
              <p className="px-4 py-3 text-sm text-muted">Select a group with membership to post.</p>
            )}
          </div>
          <form onSubmit={post}>
            <textarea
              name="body"
              rows={3}
              required
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
              placeholder="Share a tip or question"
            />
            <Button type="submit" className="mt-2">
              Post
            </Button>
          </form>
        </div>
      </div>

      {status ? <p className="text-sm text-muted">{status}</p> : null}
    </div>
  );
}
