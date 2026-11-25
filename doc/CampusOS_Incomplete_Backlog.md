# CampusOS — Incomplete / deferred backlog

Tracked separately from the Verify + LiveKit UX sprint. Do not block verification or LiveKit work on these.

| Priority | Item | Platforms |
|----------|------|-----------|
| High | Wire `/download` + landing to APK v1.0.1; drop “coming soon” | website |
| High | Redeploy student-website for AI chat API + LiveKit join | website/ops |
| High | Copy `LIVEKIT_*` into portal/website deploy env (never commit secrets) | portal/website |
| High | Paystack live billing/webhooks | portal |
| Med | Market hub website parity (Business+Marketplace segment) | website |
| Med | Real AI TTS / chat-media (vs `local-tts`) | app/web |
| Med | FCM push notifications | app |
| Med | WhatsApp Phase 4: images, edit/delete UI, @mentions | app/web/portal |
| Low | Business `discovery_tags` editor | portal |
| Low | Lecturer QR attendance, exam seating | portal |
| Low | Edge functions + cron email digests | supabase |
| Low | Mapbox housing pin on app | app |
| Deferred | Food cart on Expo; mic→AI; E2E chat; Track C fleets | — |

## Free ID verification vendors (optional later)

- **Studid** — free university SSO API; weak Nigerian coverage today.
- **Idswyft Community** — free self-host OCR/liveness; ops-heavy.
- **v1 path shipped:** school email domain match, lecturer/school invite, ID upload + school review.
