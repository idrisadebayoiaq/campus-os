export const BUSINESS_TYPES = [
  {
    key: "housing_provider",
    title: "Housing",
    description: "Landlords and authorized agents listing rooms near campus.",
  },
  {
    key: "food_vendor",
    title: "Food / restaurant",
    description: "Restaurants, bukas, and grocery vendors for pickup orders.",
  },
  {
    key: "campus_service",
    title: "Campus services",
    description: "Print, laundry, beauty, repairs, and other local services.",
  },
  {
    key: "marketplace_seller",
    title: "Marketplace seller",
    description: "Commercial sellers of used goods and campus essentials.",
  },
] as const;

export type BusinessTypeKey = (typeof BUSINESS_TYPES)[number]["key"];

export function isBusinessType(value: string): value is BusinessTypeKey {
  return BUSINESS_TYPES.some((item) => item.key === value);
}

export function businessTypeLabel(key: string) {
  return BUSINESS_TYPES.find((item) => item.key === key)?.title ?? key;
}
