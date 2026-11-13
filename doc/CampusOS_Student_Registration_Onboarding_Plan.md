# CampusOS — Student Registration & Progressive Onboarding

**Version:** 1.0  
**Date:** November 2026  
**Status:** Web MVP implemented  
**Surface:** `student-website/` (APK parity later)

---

## Approach

Progressive onboarding — not a long gate before the app.

1. **Create account** (required): name, email, password, Terms + Privacy  
2. **Student status** (required)  
3. **School** (required for enrolled; skippable for aspiring)  
4. **Academic profile** (skippable)  
5. **Interests** (skippable; reorders dashboard only)  
6. **Dashboard** with optional setup cards (never lock core features)

Sensitive or service-specific data (housing budget, allergies, etc.) is collected later in Profile or at point of use.

---

## Schema

| Table | Purpose |
|-------|---------|
| `profiles` | Names, phone, language, account type |
| `student_profiles` | Status, programme, level, session, verification level |
| `student_enrollments` | Institution/campus link + verification status |
| `student_preferences` | Interests, study goals, AI style |
| `housing_preferences` | Budget/area alerts (optional) |
| `notification_preferences` | Category + channel toggles |
| `user_consents` | Terms/privacy/marketing versions |
| `onboarding_progress` | Steps completed/skipped + setup tasks |
| `faculties` / `departments` / `programmes` / `academic_sessions` | School taxonomy |
| `institution_requests` | Missing-school requests |
| `student_verifications` | Basic → verified upgrade path |

Auth credentials stay in Supabase Auth. RLS: students own their rows.

---

## Routes

| Route | Role |
|-------|------|
| `/signup` | Screen 1 account creation |
| `/onboarding` | Screens 2–5 progressive wizard |
| `/dashboard` | Personalized home + setup cards |
| `/profile` | Edit academic/housing/interests/notifications |

---

## Personalization rules

- Interests reorder modules; all modules remain accessible.  
- Fresher/aspiring defaults prioritize housing + guides.  
- Setup cards suggest courses, timetable, housing budget, study goal.  
- Completing a card records `completed_setup_tasks` — no % lock.

---

## Verification levels

| Level | Access |
|-------|--------|
| Basic | Browse housing/food, personal study tools, public services |
| Verified | Future: student-only groups / trusted marketplace roles |

Do not require NIN or ID upload for basic accounts.

---

## Implementation checklist

- [x] Progressive wizard UI  
- [x] Signup first/last/preferred name + consents  
- [x] School + academic + interests persistence  
- [x] Dashboard reordering + setup cards  
- [x] Profile preference editors  
- [ ] Google OAuth  
- [ ] Phone/SMS auth  
- [ ] School-email verification flow UI  
- [ ] Parental consent path for under-18  
- [ ] Housing search auto-filter from preferences  

---

*End of registration/onboarding plan v1.0*
