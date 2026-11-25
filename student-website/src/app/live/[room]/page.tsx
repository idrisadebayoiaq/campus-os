import Link from "next/link";
import { redirect } from "next/navigation";
import { LiveKitRoomClient } from "@/components/livekit-room";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Live session" };
export const instant = false;

export default async function LiveRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ room: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { room } = await params;
  const { mode } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const next = `/live/${encodeURIComponent(room)}${mode === "voice" ? "?mode=voice" : ""}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const roomName = decodeURIComponent(room);
  const sessionMode = mode === "voice" ? "voice" : "video";

  return (
    <Container className="space-y-6 py-8">
      <PageHeader
        title={sessionMode === "voice" ? "Voice call" : "Video call"}
        description={roomName}
      />
      <p className="text-sm text-muted">
        <Link href="/" className="underline">
          Back to CampusOS
        </Link>
      </p>
      <LiveKitRoomClient roomName={roomName} mode={sessionMode} />
    </Container>
  );
}
