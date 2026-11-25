"use client";

import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  createLocalAudioTrack,
  createLocalVideoTrack,
  type LocalTrack,
  type RemoteTrack,
} from "livekit-client";
import { Button } from "@/components/ui";

export function LiveKitRoomClient({
  roomName,
  mode = "video",
}: {
  roomName: string;
  mode?: "video" | "voice";
}) {
  const [status, setStatus] = useState("Connecting…");
  const [error, setError] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteHostRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const localTracksRef = useRef<LocalTrack[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function connect() {
      try {
        const res = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomName,
            audioOnly: mode === "voice",
            canPublish: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Token failed");
        if (cancelled) return;

        const room = new Room();
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (!remoteHostRef.current) return;
          const el = track.attach();
          el.className = "h-full w-full object-cover rounded-xl bg-black";
          remoteHostRef.current.appendChild(el);
        });
        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach().forEach((el) => el.remove());
        });
        room.on(RoomEvent.Disconnected, () => setStatus("Disconnected"));

        await room.connect(data.url, data.token);

        const audio = await createLocalAudioTrack();
        localTracksRef.current.push(audio);
        await room.localParticipant.publishTrack(audio);

        if (mode === "video") {
          const video = await createLocalVideoTrack();
          localTracksRef.current.push(video);
          await room.localParticipant.publishTrack(video);
          if (localVideoRef.current) {
            video.attach(localVideoRef.current);
          }
        }

        if (!cancelled) setStatus(mode === "voice" ? "In voice call" : "In video call");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not join");
          setStatus("Failed");
        }
      }
    }
    void connect();
    return () => {
      cancelled = true;
      localTracksRef.current.forEach((t) => {
        t.stop();
        t.detach();
      });
      localTracksRef.current = [];
      void roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, [roomName, mode]);

  async function leave() {
    localTracksRef.current.forEach((t) => {
      t.stop();
      t.detach();
    });
    localTracksRef.current = [];
    await roomRef.current?.disconnect();
    setStatus("Left");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{status}</p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {mode === "video" ? (
          <video
            ref={localVideoRef}
            muted
            autoPlay
            playsInline
            className="aspect-video w-full rounded-xl bg-black object-cover"
          />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-surface text-sm text-muted">
            Microphone on
          </div>
        )}
        <div
          ref={remoteHostRef}
          className="aspect-video w-full overflow-hidden rounded-xl bg-black"
        />
      </div>
      <Button type="button" variant="secondary" onClick={() => void leave()}>
        Leave
      </Button>
    </div>
  );
}
