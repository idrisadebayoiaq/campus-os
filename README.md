# CampusOS

Housing-first Nigerian student platform with a campus-scoped student app and a separate business portal.

## Apps (separate Vercel deploys)

| Folder | Purpose | Local | Vercel |
|--------|---------|-------|--------|
| `student-website/` | Student app (auth → dashboard) | `pnpm dev` → :3000 | Root = `student-website` |
| `business-portal/` | Business apply, listings, admin | `pnpm dev` → :3001 | Root = `business-portal` |

Both apps share one Supabase project. There is no public marketing site — `/` redirects to login.

## Quick start

```bash
cd student-website
cp .env.local.example .env.local
pnpm install
pnpm dev

# new terminal
cd business-portal
cp .env.local.example .env.local
pnpm install
pnpm dev
```

Env needs: Supabase URL + anon key, `OPENROUTER_API_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`. Service role and Mapbox secret stay server-only.

## Docs

- `doc/CampusOS_Nigerian_Student_Platform_Complete_Blueprint.pdf` — product blueprint
- `doc/CampusOS_Implementation_Plan.md` — Track A platform plan + completion status
- `doc/CampusOS_Study_Tools_Implementation_Plan.md` — **next track**: 30 academic features in 5 phases
- `supabase/migrations/` — database migrations

## Status

- Track A (auth, housing, food, marketplace, portal, admin): largely complete; Paystack live billing + APK deferred
- Track Study: web MVP live at `/study` (courses → AI tutor → CBT → groups). Model: `deepseek/deepseek-v4.1-flash`
- Progressive student onboarding: `/signup` → `/onboarding` (status/school/academic/interests) → personalized `/dashboard`
