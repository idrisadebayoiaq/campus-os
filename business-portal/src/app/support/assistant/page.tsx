import Link from "next/link";
import { redirect } from "next/navigation";
import { AssistantChat } from "@/components/assistant-chat";
import { Container } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Chat live · Support" };
export const instant = false;

export default async function AssistantPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/support/assistant");

  return (
    <Container className="space-y-4 py-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/support" className="text-sm text-muted hover:text-fg">
            ← Help & support
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Chat live</h1>
        </div>
        <Link href="/support/new" className="text-sm font-medium text-accent hover:underline">
          Prefer a person? Chat with support
        </Link>
      </div>
      <AssistantChat userId={user.id} />
      <p className="text-xs text-muted">
        The assistant can make mistakes. It never asks for your password and can&apos;t change
        payments — those go to the support team.
      </p>
    </Container>
  );
}
