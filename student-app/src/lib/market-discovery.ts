export type MarketMode = "business" | "marketplace";

export type BusinessChip =
  | "all"
  | "food"
  | "barber"
  | "tailor"
  | "laundry"
  | "print"
  | "other";

export type MarketplaceChip =
  | "all"
  | "goods"
  | "services"
  | "electronics"
  | "fashion"
  | "books"
  | "other";

export const BUSINESS_CHIPS: { key: BusinessChip; label: string }[] = [
  { key: "all", label: "All" },
  { key: "food", label: "Food" },
  { key: "barber", label: "Barber" },
  { key: "tailor", label: "Tailor" },
  { key: "laundry", label: "Laundry" },
  { key: "print", label: "Print" },
  { key: "other", label: "Other" },
];

export const MARKETPLACE_CHIPS: { key: MarketplaceChip; label: string }[] = [
  { key: "all", label: "All" },
  { key: "goods", label: "Goods" },
  { key: "services", label: "Services" },
  { key: "electronics", label: "Electronics" },
  { key: "fashion", label: "Fashion" },
  { key: "books", label: "Books" },
  { key: "other", label: "Other" },
];

const BUSINESS_KEYWORDS: Record<Exclude<BusinessChip, "all">, string[]> = {
  food: [
    "restaurant",
    "food",
    "hungry",
    "eat",
    "buka",
    "cafeteria",
    "jollof",
    "meal",
    "vendor",
    "kitchen",
    "canteen",
    "snack",
  ],
  barber: ["barber", "hair", "fade", "salon", "cut", "shave", "stylist"],
  tailor: ["tailor", "sew", "fashion", "agbada", "dressmaker", "alteration"],
  laundry: ["laundry", "wash", "dryclean", "dry-clean", "ironing"],
  print: ["print", "photocopy", "xerox", "binding", "laminat", "typing"],
  other: [],
};

const MARKETPLACE_KEYWORDS: Record<Exclude<MarketplaceChip, "all">, string[]> =
  {
    goods: ["goods", "item", "product", "sell"],
    services: ["service", "repair", "fix"],
    electronics: [
      "phone",
      "laptop",
      "electronics",
      "gadget",
      "charger",
      "earpod",
      "iphone",
      "android",
      "tablet",
    ],
    fashion: ["fashion", "cloth", "shoe", "bag", "wear", "sneaker"],
    books: ["book", "textbook", "note", "handout", "pdf"],
    other: [],
  };

export function inferBusinessChipFromQuery(query: string): BusinessChip | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  for (const [chip, words] of Object.entries(BUSINESS_KEYWORDS) as [
    Exclude<BusinessChip, "all">,
    string[],
  ][]) {
    if (words.some((w) => q.includes(w))) return chip;
  }
  return null;
}

export function inferMarketplaceChipFromQuery(
  query: string,
): MarketplaceChip | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  for (const [chip, words] of Object.entries(MARKETPLACE_KEYWORDS) as [
    Exclude<MarketplaceChip, "all">,
    string[],
  ][]) {
    if (words.some((w) => q.includes(w))) return chip;
  }
  return null;
}

export function businessTypeLabel(type: string | null | undefined) {
  switch (type) {
    case "food_vendor":
      return "Food";
    case "campus_service":
      return "Service";
    case "marketplace_seller":
      return "Shop";
    case "housing_provider":
      return "Housing";
    default:
      return "Business";
  }
}

export function resolveBusinessChip(
  biz: {
    business_type?: string | null;
    display_name?: string | null;
    bio?: string | null;
    discovery_tags?: string[] | null;
  },
): BusinessChip {
  const tags = (biz.discovery_tags || []).map((t) => t.toLowerCase());
  const blob = `${biz.display_name || ""} ${biz.bio || ""} ${tags.join(" ")}`.toLowerCase();

  if (biz.business_type === "food_vendor") return "food";

  for (const chip of ["barber", "tailor", "laundry", "print"] as const) {
    if (
      tags.includes(chip) ||
      BUSINESS_KEYWORDS[chip].some((w) => blob.includes(w))
    ) {
      return chip;
    }
  }
  if (biz.business_type === "campus_service") return "other";
  if (biz.business_type === "marketplace_seller") return "other";
  return "other";
}

export function matchesBusinessFilter(
  biz: {
    business_type?: string | null;
    display_name?: string | null;
    bio?: string | null;
    discovery_tags?: string[] | null;
  },
  chip: BusinessChip,
  query: string,
) {
  const resolved = resolveBusinessChip(biz);
  if (chip !== "all" && resolved !== chip) {
    // Food chip also includes food_vendor always
    if (!(chip === "food" && biz.business_type === "food_vendor")) return false;
  }
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const intent = inferBusinessChipFromQuery(q);
  if (intent && intent !== "other") {
    // When intent maps to a chip, require that chip match OR text match
    if (resolved === intent) return true;
  }
  const blob = `${biz.display_name || ""} ${biz.bio || ""} ${(biz.discovery_tags || []).join(" ")}`.toLowerCase();
  const intentWords =
    intent && intent !== "all" ? BUSINESS_KEYWORDS[intent] || [] : [];
  return (
    blob.includes(q) ||
    intentWords.some((w: string) => q.includes(w) && blob.includes(w))
  );
}

export function filterBusinesses<
  T extends {
    business_type?: string | null;
    display_name?: string | null;
    bio?: string | null;
    discovery_tags?: string[] | null;
  },
>(rows: T[], chip: BusinessChip, query: string): T[] {
  const q = query.trim().toLowerCase();
  const intent = inferBusinessChipFromQuery(q);
  const effectiveChip = chip === "all" && intent ? intent : chip;

  return rows.filter((biz) => {
    const resolved = resolveBusinessChip(biz);
    if (effectiveChip !== "all") {
      if (effectiveChip === "food") {
        if (biz.business_type !== "food_vendor" && resolved !== "food") {
          return false;
        }
      } else if (resolved !== effectiveChip) {
        return false;
      }
    }
    if (!q) return true;
    // Drop pure intent words from substring requirement when chip already applied
    const blob = `${biz.display_name || ""} ${biz.bio || ""} ${(biz.discovery_tags || []).join(" ")}`.toLowerCase();
    const intentWords =
      intent && intent !== "all" ? BUSINESS_KEYWORDS[intent] || [] : [];
    if (
      intent &&
      q.split(/\s+/).every((tok) => intentWords.includes(tok) || tok.length < 3)
    ) {
      return true;
    }
    return blob.includes(q) || q.split(/\s+/).some((tok) => tok.length > 2 && blob.includes(tok));
  });
}

export function filterListings<
  T extends {
    title?: string | null;
    kind?: string | null;
    category?: string | null;
  },
>(rows: T[], chip: MarketplaceChip, query: string): T[] {
  const q = query.trim().toLowerCase();
  const intent = inferMarketplaceChipFromQuery(q);
  const effective = chip === "all" && intent ? intent : chip;

  return rows.filter((item) => {
    const kind = (item.kind || "").toLowerCase();
    const category = (item.category || "").toLowerCase();
    const title = (item.title || "").toLowerCase();
    const blob = `${title} ${kind} ${category}`;

    if (effective === "goods" && kind && kind !== "goods") return false;
    if (effective === "services" && kind && kind !== "service" && kind !== "services")
      return false;
    if (effective === "electronics") {
      if (!MARKETPLACE_KEYWORDS.electronics.some((w) => blob.includes(w)) && !category.includes("electron"))
        return false;
    }
    if (effective === "fashion") {
      if (!MARKETPLACE_KEYWORDS.fashion.some((w) => blob.includes(w)) && !category.includes("fashion") && !category.includes("cloth"))
        return false;
    }
    if (effective === "books") {
      if (!MARKETPLACE_KEYWORDS.books.some((w) => blob.includes(w)) && !category.includes("book"))
        return false;
    }
    if (effective === "other" && chip === "other") {
      // keep items that don't match specialty chips
      const specialty =
        MARKETPLACE_KEYWORDS.electronics.some((w) => blob.includes(w)) ||
        MARKETPLACE_KEYWORDS.fashion.some((w) => blob.includes(w)) ||
        MARKETPLACE_KEYWORDS.books.some((w) => blob.includes(w));
      if (specialty) return false;
    }

    if (!q) return true;
    return blob.includes(q) || q.split(/\s+/).some((tok) => tok.length > 2 && blob.includes(tok));
  });
}
