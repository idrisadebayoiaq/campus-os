import Link from "next/link";
import { redirect } from "next/navigation";
import { NewTicketForm } from "@/components/support-forms";
import { Container } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Chat with support" };
export const instant = false;

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/support/new");

  return (
    <Container className="py-6 sm:py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/support" className="text-sm text-muted hover:text-fg">
            ← Help & support
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Chat with support</h1>
          <p className="mt-1 text-sm text-muted">
            A person on the CampusOS support team will reply in the ticket chat. You&apos;ll get a
            notification when they do.
          </p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 sm:p-6">
          <NewTicketForm defaultCategory={category} />
        </div>
        <p className="text-sm text-muted">
          Quick question?{" "}
          <Link href="/support/assistant" className="font-medium text-accent hover:underline">
            Ask the assistant
          </Link>{" "}
          for an instant answer.
        </p>
      </div>
    </Container>
  );
}
