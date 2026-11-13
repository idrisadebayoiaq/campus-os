"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

type Property = {
  id: string;
  title: string;
  is_published: boolean;
  verification_label: string | null;
  campus_id: string;
  business_profiles:
    | { display_name: string }
    | { display_name: string }[]
    | null;
  property_units: { id: string; title: string; status: string; is_published: boolean }[] | null;
};

const LABELS = [
  "unverified",
  "identity_checked",
  "provider_checked",
  "property_inspected",
] as const;

export function ListingModeration({ properties }: { properties: Property[] }) {
  const router = useRouter();

  async function setPublished(id: string, is_published: boolean) {
    const supabase = createClient();
    await supabase.from("properties").update({ is_published }).eq("id", id);
    await supabase
      .from("property_units")
      .update({ is_published })
      .eq("property_id", id);
    router.refresh();
  }

  async function setLabel(id: string, verification_label: string) {
    const supabase = createClient();
    await supabase.from("properties").update({ verification_label }).eq("id", id);
    router.refresh();
  }

  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {properties.map((property) => {
        const business = Array.isArray(property.business_profiles)
          ? property.business_profiles[0]
          : property.business_profiles;
        return (
          <div key={property.id} className="space-y-3 px-4 py-4 text-sm">
            <div>
              <p className="font-medium">{property.title}</p>
              <p className="text-muted">
                {business?.display_name || "Provider"} ·{" "}
                {property.is_published ? "Published" : "Hidden"} ·{" "}
                {(property.verification_label || "unverified").replaceAll("_", " ")} ·{" "}
                {(property.property_units || []).length} units
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setPublished(property.id, true)}>
                Publish
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPublished(property.id, false)}
              >
                Hide
              </Button>
              {LABELS.map((label) => (
                <Button
                  key={label}
                  type="button"
                  variant="ghost"
                  onClick={() => setLabel(property.id, label)}
                >
                  {label.replaceAll("_", " ")}
                </Button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
