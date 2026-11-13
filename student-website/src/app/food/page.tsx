import Link from "next/link";
import { Suspense } from "react";
import { CampusScene } from "@/components/campus-3d/campus-scene";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { getStudentCampus } from "@/lib/campus";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Food" };

async function FoodDirectory() {
  const supabase = await createClient();
  const campus = await getStudentCampus(supabase);

  if (!campus) {
    return (
      <EmptyState
        title="Choose your campus first"
        description="Pick a school first."
      />
    );
  }

  const { data: vendors } = await supabase
    .from("business_profiles")
    .select("id, display_name, slug, bio, setup_complete")
    .eq("business_type", "food_vendor")
    .eq("campus_id", campus.campusId)
    .eq("is_active", true)
    .eq("setup_complete", true);

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
        Food near {campus.institutionName} · {campus.campusName}
      </div>
      {!vendors?.length ? (
        <EmptyState
          title="No food vendors on this campus yet"
          description="No vendors yet."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {vendors.map((v) => (
            <Link
              key={v.id}
              href={`/food/${v.id}`}
              className="rounded-md border border-border p-4 hover:bg-surface"
            >
              <p className="font-medium">{v.display_name}</p>
              <p className="mt-1 text-sm text-muted">{v.bio || "Campus food vendor"}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FoodPage() {
  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="Food"
          description="Pickup near your campus."
        />
        <CampusScene
          mode="zones"
          title="Food zone near campus"
          heightClass="h-48 sm:h-60"
          defaultOpen={false}
        />
        <Suspense fallback={<p className="text-sm text-muted">Loading food…</p>}>
          <FoodDirectory />
        </Suspense>
      </div>
    </Container>
  );
}
