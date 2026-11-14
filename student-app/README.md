# CampusOS student app (Track B)

Expo Router twin of the student website — auth, home shell, and campus-scoped housing for Android/iOS via Expo Go. Business management stays on the portal.

## Setup

```bash
cd student-app
npm install
cp .env.example .env
# Fill EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
# (same Supabase project as student-website)
npm start
```

Scan the QR code with Expo Go, or press `a` for Android emulator.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Expo dev server |
| `npm run android` | Open Android |
| `npm run ios` | Open iOS simulator (macOS) |

## What’s in B0 / housing start

- Login / signup against shared Supabase Auth
- Tabs: Home, Housing, Study, Inbox, Profile
- Housing list + detail (campus membership scoped)
- Profile sign-out

Study, Inbox messaging, enquire/inspect, and signed APK hosting come in later Track B phases.

## Notes

- Do **not** commit `.env`.
- Scheme: `campusos://`
- Android package: `com.campusos.student`
