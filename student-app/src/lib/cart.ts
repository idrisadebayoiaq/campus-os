import { useSyncExternalStore } from "react";

export type CartOption = { id: string; name: string; price_delta: number };

export type CartLine = {
  key: string;
  menuItemId: string;
  name: string;
  /** Price the student sees: today's special price when one is live, otherwise the menu price. */
  unitPrice: number;
  quantity: number;
  options: CartOption[];
};

export type Cart = {
  businessId: string | null;
  businessName: string;
  lines: CartLine[];
};

let cart: Cart = { businessId: null, businessName: "", lines: [] };
const listeners = new Set<() => void>();

function emit(next: Cart) {
  cart = next;
  listeners.forEach((l) => l());
}

export function getCart() {
  return cart;
}

export function useCart() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cart,
    () => cart,
  );
}

export function lineKey(menuItemId: string, options: CartOption[]) {
  return `${menuItemId}|${options.map((o) => o.id).sort().join(",")}`;
}

export function lineTotal(line: CartLine) {
  return (line.unitPrice + line.options.reduce((n, o) => n + o.price_delta, 0)) * line.quantity;
}

export function cartCount(c: Cart) {
  return c.lines.reduce((n, l) => n + l.quantity, 0);
}

export function cartSubtotal(c: Cart) {
  return c.lines.reduce((n, l) => n + lineTotal(l), 0);
}

/** Adds an item. Starting an order at a different kitchen empties the old cart first. */
export function addToCart(business: { id: string; name: string }, line: Omit<CartLine, "key">) {
  const base: Cart = cart.businessId === business.id ? cart : { businessId: business.id, businessName: business.name, lines: [] };
  const key = lineKey(line.menuItemId, line.options);
  const existing = base.lines.find((l) => l.key === key);
  const lines = existing
    ? base.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, l.quantity + line.quantity) } : l))
    : [...base.lines, { ...line, key }];
  emit({ ...base, lines });
}

export function setLineQuantity(key: string, quantity: number) {
  const lines = cart.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, quantity) } : l)).filter((l) => l.quantity > 0);
  emit(lines.length ? { ...cart, lines } : { businessId: null, businessName: "", lines: [] });
}

export function clearCart() {
  emit({ businessId: null, businessName: "", lines: [] });
}
