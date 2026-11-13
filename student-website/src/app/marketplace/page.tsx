import Link from "next/link";
import { Suspense } from "react";
import { CampusScene } from "@/components/campus-3d/campus-scene";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { formatNaira, getStudentCampus } from "@/lib/campus";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Marketplace" };

async function MarketplaceList() {
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

  const { data: listings } = await supabase
    .from("marketplace_listings")
    .select("*")
    .eq("campus_id", campus.campusId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(40);

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
        Goods & services near {campus.institutionName} · {campus.campusName}
      </div>
      {!listings?.length ? (
        <EmptyState
          title="Nothing listed yet"
          description="No listings yet."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {listings.map((item) => (
            <Link
              key={item.id}
              href={`/marketplace/${item.id}`}
              className="rounded-md border border-border p-4 hover:bg-surface"
            >
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-sm capitalize text-muted">
                {item.kind} · {item.category}
                {item.is_commercial ? " · commercial" : ""}
              </p>
              <p className="mt-3 text-sm">{item.price != null ? formatNaira(item.price) : "Ask"}</p>
              <p className="mt-2 line-clamp-2 text-sm text-muted">{item.description}</p>
            </Link>
          ))}
        </div>
      )}
      <Link href="/profile" className="text-sm underline underline-offset-2">
        Campus-scoped browsing uses the school in your profile
      </Link>
    </div>
  );
}

export default function MarketplacePage() {
  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="Marketplace"
          description="Goods and services on your campus."
        />
        <CampusScene
          mode="business"
          title="Campus market & services zone"
          heightClass="h-48 sm:h-60"
          defaultOpen={false}
        />
        <Suspense fallback={<p className="text-sm text-muted">Loading marketplace…</p>}>
          <MarketplaceList />
        </Suspense>
      </div>
    </Container>
  );
}
