import { redirect } from "next/navigation";

// Billing was split into Plan, Payouts and Payment requests. Old links land on Payouts.
export default function BillingPage() {
  redirect("/payouts");
}
