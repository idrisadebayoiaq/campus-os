import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import {
  isLiveKitConfigured,
  publicLiveKitUrl,
} from "@/lib/livekit";
import { createClient } from "@/lib/supabase/server";

/**
 * Mint LiveKit access tokens.
 * Body: { roomName: string, identity?: string, name?: string, canPublish?: boolean }
 */
export async function POST(request: Request) {
  if (!isLiveKitConfigured()) {
    return NextResponse.json(
      {
        error:
          "LiveKit is not configured yet. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET, then redeploy.",
      },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    roomName?: string;
    identity?: string;
    name?: string;
    canPublish?: boolean;
  } | null;

  if (!body?.roomName) {
    return NextResponse.json({ error: "roomName required" }, { status: 400 });
  }

  const identity = body.identity || user.id;
  const displayName =
    body.name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "CampusOS";

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    {
      identity,
      name: displayName,
      ttl: "2h",
    },
  );
  at.addGrant({
    roomJoin: true,
    room: body.roomName,
    canPublish: body.canPublish !== false,
    canSubscribe: true,
  });

  const token = await at.toJwt();
  return NextResponse.json({
    token,
    url: publicLiveKitUrl(),
    roomName: body.roomName,
  });
}
