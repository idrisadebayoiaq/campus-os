import Link from "next/link";
import { Suspense } from "react";
import { CampusScene } from "@/components/campus-3d/campus-scene";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Campus guides",
  description: "CampusOS guides for schools and nearby housing areas.",
};

function slugify(parts: string[]) {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function GuideList() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campuses")
    .select("id, name, city, state, institutions(name, short_name)")
    .eq("is_active", true)
    .order("name");

  if (!data?.length) {
    return (
      <EmptyState
        title="No guides yet"
        description="No guides yet."
      />
    );
  }

  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {data.map((campus) => {
        const institution = Array.isArray(campus.institutions)
          ? campus.institutions[0]
          : campus.institutions;
        const slug = slugify([
          institution?.short_name || institution?.name || "school",
          campus.name,
        ]);
        return (
          <Link
            key={campus.id}
            href={`/guides/${slug}`}
            className="block px-4 py-4 hover:bg-surface"
          >
            <p className="font-medium">
              {institution?.name} · {campus.name}
            </p>
            <p className="mt-1 text-sm text-muted">
              {[campus.city, campus.state].filter(Boolean).join(", ")}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

export default function GuidesPage() {
  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="Campus guides"
          description="Campus orientation."
        />
        <CampusScene
          mode="zones"
          title="Orient yourself around campus"
          defaultOpen
        />
        <Suspense fallback={<p className="text-sm text-muted">Loading guides…</p>}>
          <GuideList />
        </Suspense>
      </div>
    </Container>
  );
}
