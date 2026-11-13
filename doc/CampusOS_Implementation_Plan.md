# CampusOS Implementation Plan

**Version:** 1.1  
**Date:** November 2026  
**Status:** Track A largely complete — see §2 checklist + §9 status matrix  
**Primary sources:** `CampusOS_Nigerian_Student_Platform_Complete_Blueprint.pdf` + product decisions below  
**Related:** `doc/CampusOS_Study_Tools_Implementation_Plan.md` (academic companion — next major track)  


---

## 0. Product decisions locked for build

| Decision | Choice |
|----------|--------|
| Build order | **Student website + Business portal first**, then student APK |
| Student APK | Later twin of student website; download link prepared on student site |
| Business access | **Portal only** — no business dashboard in student app/web |
| Student web | Full student feature set (parity target for future APK) |
| Visual system | **Simple black + white** (+ gray neutrals, one accent for status only) |
| Backend | Supabase (Auth, Postgres, Storage, RLS, Edge Functions) |
| Web stack | Two separate Next.js apps for Vercel: `student-website/` + `business-portal/` |
| Payments | Paystack (server-verified webhooks); subscriptions first for housing providers |
| Launch scope | One campus pilot; housing-first; food as real restaurant flow in Phase 2 |
| Brand | CampusOS is a working name |

### Surface map

```
Student website     → browse, search, enquire, order, academics, APK download CTA
Business portal     → apply → admin review → setup → list/manage → orders/inspections
Admin console       → nested under portal (/admin) with admin role only
Student APK         → AFTER web parity; not in Track A
```

### Design system (simple)

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#FFFFFF` | Page background |
| `--fg` | `#0A0A0A` | Primary text / icons |
| `--muted` | `#737373` | Secondary text |
| `--border` | `#E5E5E5` | Dividers, inputs, cards when needed |
| `--surface` | `#FAFAFA` | Subtle sections, tables |
| `--inverse-bg` | `#0A0A0A` | Primary buttons, hero bars |
| `--inverse-fg` | `#FFFFFF` | Text on inverse |
| `--danger` | `#B91C1C` | Errors / reject only |
| `--success` | `#15803D` | Success / approved only |
| `--warn` | `#A16207` | Pending / needs changes |

Rules:
- No purple gradients, no heavy shadows, no pill spam.
- Prefer whitespace + clear type hierarchy over cards.
- Cards only where interaction needs a container (forms, order rows, listing results).
- Large tap targets, strong contrast, naira formatting (`₦`).

---

## 1. How to use this plan

1. Complete phases **in order**. Do not skip gates.
2. Each phase ends with an **Exit gate** — pass before starting the next.
3. Prefer thin vertical slices (one real flow working end-to-end) over many empty screens.
4. **Deploy as two Vercel projects** — separate folders, separate builds.

Repo structure:

```
student-website/        # Vercel project A — student experience + APK download page
business-portal/        # Vercel project B — apply, dashboards, admin
supabase/
  migrations/           # shared database source of truth
doc/                    # blueprint + this plan
```

Local ports: student `3000`, portal `3001`.
Both apps share the same Supabase project (Auth + Postgres + Storage).

---

## TRACK A — Student website + Business portal

> Goal: a usable one-campus housing marketplace on the web, plus a working business application → approval → portal pipeline. Food restaurant depth comes after housing MVP works.

---

### Repo layout (locked)

- `student-website/` — Vercel project A (port 3000)
- `business-portal/` — Vercel project B (port 3001) + admin
- Shared Supabase project; migrations in `supabase/migrations/`
- Package manager: **pnpm** (store preferred on D: to spare C: disk)

### Phase A0 — Foundations (Week 1)

**Objective:** Repo, design tokens, auth shell, campus model, empty shells for student + portal.

#### Steps

1. Initialize monorepo / Next.js + TypeScript + Tailwind (or CSS variables).
2. Add Supabase project; connect env vars (URL + anon key; service role server-only).
3. Implement design tokens (black/white system above) in global CSS.
4. Create route shells:
   - Student: `/`, `/housing`, `/school`, `/inbox`, `/profile`, `/download`
   - Portal: `/business`, `/business/apply`, `/business/login`, `/business/dashboard`
   - Admin: `/admin`, `/admin/applications`, `/admin/listings`
5. Auth: email/phone (or email first) via Supabase Auth.
6. Roles table / `profiles` + `roles` (student | provider | vendor | moderator | admin).
7. Institutions schema: `institutions`, `campuses`, `campus_areas`.
8. Seed **one pilot campus** (placeholder name until research picks final school).
9. Student onboarding: choose school + campus (required before personalized home).
10. Legal stubs: Privacy, Terms, Business rules pages (content draft OK).

#### Exit gate A0

- [ ] Student and portal routes load with shared black/white UI.
- [ ] User can sign up / sign in.
- [ ] Profile can store campus membership.
- [ ] RLS enabled on profiles; anon cannot read private docs.
- [ ] One seeded institution + campus visible in UI.

---

### Phase A1 — Business application + admin approval (Week 1–2)

**Objective:** “Apply as business” funnel and admin approve/reject — before any public listings.

#### Business types (chooser)

| Type key | Label | Portal after approval |
|----------|-------|------------------------|
| `housing_provider` | Housing (landlord / agent) | Property dashboard |
| `food_vendor` | Food / restaurant / groceries | Restaurant dashboard |
| `campus_service` | Campus services (print, laundry, beauty, repairs…) | Services dashboard |
| `marketplace_seller` | Commercial marketplace seller | Goods dashboard |

#### Steps

1. Public page `/business` — explain portal-only access; CTA **Apply as business** + **Business sign-in**. No APK download here.
2. `/business/apply` Step 1: choose business type.
3. `/business/apply/[type]` Step 2: type-specific form + file uploads (ID, authorization, store photos, etc.).
4. Persist `business_applications` with status:
   - `draft` → `submitted` → `under_review` → `approved` | `rejected` | `needs_changes`
5. Store uploads in **private** Storage buckets; only admin/moderator can read.
6. Applicant sees `/business/applications/[id]` status page (and email notification if configured).
7. Admin queue `/admin/applications`:
   - View details + docs
   - Approve / Reject / Request changes (reason required for reject/changes)
8. On **Approve**:
   - Attach role (`provider` and/or `vendor`)
   - Create `provider_profiles` or `vendors` row linked to user + campus zones
   - Redirect next login to **setup wizard**
9. On **Reject / needs_changes**: keep portal locked for listing; allow resubmit when allowed.
10. Audit log every admin decision (`audit_logs`).

#### Exit gate A1

- [ ] Applicant cannot self-approve or set verified badge.
- [ ] Admin can approve/reject with reason; status visible to applicant.
- [ ] Approved user lands in portal setup, not student home.
- [ ] Students cannot access `/business/dashboard` or `/admin/*`.
- [ ] Application documents never appear on student website.

---

### Phase A2 — Portal setup wizard + public business profile (Week 2)

**Objective:** After approval, business completes setup before publishing.

#### Setup wizard steps (portal)

1. Public profile (name, logo, cover, bio, campus/service zones).
2. Hours / availability defaults.
3. Contact preferences (phone/WhatsApp visibility rules).
4. **Payment method** (Paystack subaccount / bank details) — required before paid plans or food checkout; housing providers need it before paid subscription.
5. Confirm policies → mark `setup_complete = true`.

#### Publish gate

- Cannot create **live** listings until: `application approved` + `setup_complete`.
- Draft listings allowed earlier only if product needs it; default = block publish.

#### Student-facing business profile

- Public page e.g. `/businesses/[slug]` or nested under listing detail.
- Shows: name, type, verification badge, zones, hours, public photos — **not** KYC docs.

#### Exit gate A2

- [ ] Incomplete setup blocks publish.
- [ ] Public profile shows only safe fields.
- [ ] Payment details stored securely; never exposed to students.

---

### Phase A3 — Housing marketplace MVP (Week 2–4) — **flagship**

**Objective:** End-to-end housing discovery on student website + landlord portal management.

#### Student website

1. Home: campus-scoped search shortcut + housing entry (black/white, brand-clear).
2. `/housing` search: filters — campus/area, type, total budget range, availability.
3. Listing card: photo, area, type, **total move-in cost**, verification label, freshness.
4. Listing detail: full fee breakdown, amenities, media, provider public profile, last checked.
5. Actions: Save, Ask question, Request inspection, Report listing.
6. Browse-before-signup where possible; gate send-request behind auth.
7. Zero-result state: useful copy + suggest widen filters / join waitlist.

#### Landlord portal

1. CRUD properties + units (room types, capacity, amenities, media, price components).
2. Availability status: `available` | `reserved` | `occupied` | `paused`.
3. Respond to enquiries and inspection requests (accept/decline/reschedule).
4. Pause listing instantly; reconfirm availability.
5. Basic metrics: views, saves, enquiries, inspections.

#### Admin

1. Listing review / hide / suspend.
2. Verification ladder labels (unverified → identity → provider → property inspected).
3. Fraud report queue.

#### Data (minimum)

- `provider_profiles`, `properties`, `property_units`, `amenities`, `listing_media`
- `inspection_requests`, `conversations` or enquiry messages
- `reports`, `verification_audits`
- Rent components stored separately (base, agent, agreement, caution, service, period)

#### Hard rules

- No self-granted verified badge.
- Do not facilitate unauthorized school-hostel bed resale.
- Approximate public map pin ≠ precise inspection-only address.
- Off-platform rent payment OK for MVP with clear warning (no fake escrow).

#### Exit gate A3

- [ ] Student can filter and open a real seeded listing for the pilot campus.
- [ ] Full fee breakdown visible before enquiry.
- [ ] Inspection request creates status history; landlord can respond in portal.
- [ ] Report flow works; reporter identity not public.
- [ ] RLS: landlord A cannot edit landlord B’s property.
- [ ] Unverified listings limited in exposure (policy enforced in query).

---

### Phase A4 — Student website core (non-housing retention) (Week 4)

**Objective:** Make the student site worth returning to without building the APK yet.

#### Steps

1. **School tab basics:** timetable entries, assignment deadlines, reminders (local + server).
2. Simple GPA/CGPA calculator (configurable scale; labeled unofficial).
3. Inbox: enquiries, inspection updates, system notifications.
4. Profile: campus membership, favorites, settings, privacy links.
5. `/download` page: APK coming soon / placeholder upload slot for later file hosting.
6. SEO pages: school → campus → area → housing results (public).
7. WhatsApp-friendly share links for listings.

#### Exit gate A4

- [ ] Timetable/tasks persist across logout/reinstall (server-backed).
- [ ] Inbox shows housing enquiry/inspection states.
- [ ] Download page exists (even if APK not ready).
- [ ] Student site has no “manage business” entry points.

---

### Phase A5 — Trust, ops polish, pilot readiness (Week 5)

**Objective:** Operate one campus without shame.

#### Steps

1. Availability reconfirmation reminders (7–14 day target in peak).
2. Stale listing auto-unpublish or badge “needs reconfirm”.
3. Admin playbook screens: queues with proposed SLAs.
4. Analytics events: search, listing view, save, enquire, inspection accept, report.
5. Low-end device / slow network pass on critical flows.
6. RLS test matrix: anon, student, provider, vendor, admin.
7. Seed **30–50** permissioned real (or realistic pilot) rooms when available.
8. Content: honest campus guide page with example pricing ranges.

#### Exit gate A5

- [ ] Security review of RLS + private storage.
- [ ] Critical flows work on slow network.
- [ ] Incident/report path usable by one admin.
- [ ] Pilot metrics dashboard (even simple SQL/views) exists.

---

### Phase A6 — Food vendor (restaurant-style) on web (Week 6–8)

**Objective:** Real restaurant flow — student site orders + vendor portal kitchen board. Only after housing pilot is usable.

#### Student website

1. `/food` directory scoped to campus zones.
2. Restaurant page: menu categories, item detail, prices, prep time, open/closed.
3. Cart + checkout with **all fees shown** before pay.
4. Order tracking: `placed → accepted → preparing → ready → collected/completed` (+ cancelled).
5. Order history + report issue.

#### Vendor portal

1. Store settings, hours, service area, temporary close.
2. Menu CRUD: items, prices, stock, images, prep time.
3. Live orders board with accept/decline + timeouts.
4. Payout / payment method already from setup wizard.
5. Refunds / support flags visible to admin.

#### Rules

- Vendor acceptance required before treating as confirmed.
- Server recalculates price; Paystack webhook verifies payment.
- Start **pickup only**; no courier fleet.
- Small vendor cohort (10–15) for pilot zone.

#### Exit gate A6

- [ ] Student can complete a pickup order happy path on website.
- [ ] Vendor can run a shift from portal without using student site as admin.
- [ ] Failed payment / cancel / timeout behaviors defined and tested.
- [ ] No hygiene certification claims without process.

---

### Phase A7 — Marketplace & campus services (Week 8–9)

**Objective:** Enquiry-first services and goods — not full escrow.

#### Steps

1. Service profiles (print, laundry, beauty, repairs…) from approved `campus_service` businesses.
2. Used goods listings with expiry / sold state; commercial sellers labeled.
3. Student: browse → detail → enquire / book request.
4. Portal: manage catalog, respond to leads.
5. Report/block; discourage advance transfers for high-value items.

#### Exit gate A7

- [ ] Listings expire or require reconfirm.
- [ ] Illegal/prohibited category blocked.
- [ ] Student sees public seller profile; admin sees verification docs.

---

### Phase A8 — Monetization (housing first) (Week 9–10)

**Objective:** Charge businesses for value; keep student search free.

#### Steps

1. Provider subscription plan (trial → paid) via Paystack.
2. Clearly labeled premium placement later (never affects verification score).
3. Food take-rate or vendor fee only after A6 unit economics sketch.
4. Student paywalls: **none** on essential housing details/contact.

#### Exit gate A8

- [ ] Webhook idempotency + ledger tables working.
- [ ] Unpaid provider loses boost or listing quota per policy (document policy first).
- [ ] No student fee on core discovery.

---

## TRACK B — Student APK (only after Track A housing MVP)

> Start when student website housing + auth + inbox are stable. APK is a twin of the student website — **not** the portal.

### Phase B0 — Expo app shell

1. `apps/mobile` Expo + shared types/API.
2. Same black/white design tokens.
3. Auth against same Supabase project.
4. Tabs: Home, Explore, School, Inbox, Profile — **no business tab**.

### Phase B1 — Feature parity with student website

1. Housing search/detail/save/inspect/report.
2. School tools, inbox, profile.
3. Food order tracking (if A6 done).
4. Push notifications for inspection/order updates.

### Phase B2 — Distribution

1. Build signed APK.
2. Host file; wire `/download` on student website.
3. QR codes for campus ambassadors.
4. Still **no APK CTA on business portal**.

#### Exit gate Track B

- [ ] Student can do housing happy path on APK.
- [ ] Business users are directed to portal if they open business links.
- [ ] APK download works from student website only.

---

## TRACK C — Scale later (do not pull forward)

Defer until one-campus gates pass:

- Multi-campus expansion playbook  
- Delivery fleet / multi-vendor carts  
- Rent escrow / financing / e-sign leases  
- AI tutor / timetable OCR  
- School portal scraping  
- Deep campus life / clubs / opportunities modules  

---

## 2. Step-by-step build checklist (execute in order)

Use this as the day-to-day checklist. Check off as you go.

### Block 1 — Project bootstrap
1. [x] Create Next.js app + Tailwind/CSS variables (black/white).
2. [x] Connect Supabase; add `.env.example` (no secrets committed).
3. [x] Create `profiles`, roles, RLS policies.
4. [x] Seed institution/campus/areas.
5. [x] Student layout + Portal layout + Admin layout.

### Block 2 — Business intake
6. [x] Auth-first portal (apply from dashboard after login).
7. [x] Business type chooser.
8. [x] Type-specific application forms + private uploads.
9. [x] Admin application review queue.
10. [x] Approve → create business entity + role; Reject/Needs changes.

### Block 3 — Portal setup
11. [x] Setup wizard (profile, hours, zones, payment).
12. [x] `setup_complete` publish gate.
13. [x] Public business profile page (student-safe fields).

### Block 4 — Housing MVP
14. [x] Property/unit schema (+ media table; gallery UI thin).
15. [x] Landlord CRUD + availability + pause.
16. [x] Student housing search + detail + fee breakdown + Mapbox pin.
17. [x] Save / enquire / inspection request flows.
18. [x] Admin listing moderation + verification labels.
19. [x] Report listing flow.

### Block 5 — Student site completeness
20. [x] Timetable + deadlines + CGPA calculator (thin; full study track separate).
21. [x] Inbox + notifications.
22. [x] SEO / campus guide pages.
23. [x] `/download` APK placeholder page.

### Block 6 — Pilot hardening
24. [x] Stale badge helper (`property_needs_reconfirm`) + UI label (cron reminders deferred).
25. [x] Analytics events table + housing view tracking.
26. [x] RLS + RPC execute hardening pass (ongoing ops).
27. [x] Seed pilot listings (demo businesses/units/menu/market).

### Block 7 — Food (restaurant)
28. [x] Vendor menu CRUD.
29. [x] Student menu + pickup order (fees shown).
30. [x] Order state machine + vendor board.
31. [~] Paystack webhook stub + ledger idempotency path (live keys/refunds deferred).

### Block 8 — Services / goods
32. [x] Service/goods listings + enquiries.
33. [x] Expiry on create + report flow.

### Block 9 — Monetization
34. [~] Provider subscription tables + billing UI stub (live Paystack plans deferred).
35. [~] Ledger + webhook stub idempotency.

### Block 10 — Mobile (later)
36. [ ] Expo shell + auth.
37. [ ] Housing parity.
38. [ ] APK on `/download`.

---

## 3. Role × surface permissions (quick reference)

| Role | Student website | Business portal | Admin |
|------|-----------------|-----------------|-------|
| Visitor | Browse public housing/guides | View apply pages | No |
| Student | Full student features | No (link out to apply if interested) | No |
| Approved provider/vendor | Can also be a student account optionally | Dashboard for own business only | No |
| Moderator | Limited | Limited | Review queues |
| Admin | Impersonation avoided; use admin tools | Configure | Full audited access |

**Rule:** Managing a business is always portal. Consuming listings is always student website/APK.

---

## 4. Core status machines

### Business application
`draft → submitted → under_review → approved | rejected | needs_changes`  
(`needs_changes → submitted` on resubmit)

### Housing unit availability
`available | reserved | occupied | paused`

### Inspection request
`requested → accepted | declined → rescheduled? → completed | cancelled | no_show`

### Food order
`placed → accepted → preparing → ready → collected → completed`  
also: `declined | cancelled | payment_failed | expired`

---

## 5. Suggested milestone calendar (illustrative)

| Window | Focus |
|--------|--------|
| Days 1–5 | A0 foundations + design system |
| Days 6–12 | A1 applications + admin approval |
| Days 13–16 | A2 setup wizard + public profiles |
| Days 17–30 | A3 housing MVP end-to-end |
| Days 31–37 | A4 student retention tools + download page |
| Days 38–45 | A5 pilot hardening + beta |
| After housing pilot works | A6 food restaurant flow |
| After food pickup works | A7 services/goods → A8 monetization |
| After student web housing stable | Track B APK |

Adjust to real capacity. Gates beat calendar.

---

## 6. Definition of done — first public pilot

Pilot is ready when all are true:

1. One campus seeded; student website housing search works.
2. Businesses apply on portal; admin approves; landlords list rooms.
3. Students see listings + provider public profile; can request inspection.
4. Reports and verification controls work.
5. Student site has basic school tools + inbox.
6. APK download page exists (file optional until Track B).
7. No business management UI on student website.
8. Visual UI is consistently black/white/gray simple system.
9. RLS tested for cross-tenant isolation.
10. Team can operate verification + support for the pilot cohort.

---

## 7. Immediate next actions

Track A core is in place. Next:

1. Run closed beta on pilot campus (real landlords + students).  
2. Execute **`doc/CampusOS_Study_Tools_Implementation_Plan.md`** Phase S0–S1 (Study Hub + courses + timetable/assignments/exams/CGPA).  
3. Connect live Paystack keys for provider billing when ready.  
4. Track B APK only after housing + Study Hub S1 feel stable.  

Do **not** start delivery fleets, multi-campus expansion, or unlimited AI without usage caps.

---

## 8. Document ownership

| Doc | Purpose |
|-----|---------|
| `doc/CampusOS_Nigerian_Student_Platform_Complete_Blueprint.pdf` | Product vision & constraints |
| `doc/CampusOS_Implementation_Plan.md` | **This file** — Track A platform execution |
| `doc/CampusOS_Study_Tools_Implementation_Plan.md` | Student academic companion (30 features / 5 phases) |
| `doc/CampusOS_Student_Registration_Onboarding_Plan.md` | Progressive signup + personalization |

After campus research, add:
- Campus launch brief (chosen school + ops path)
- UI screen list / wireframes
- Verification ops manual

---

## 9. Track A status matrix (Nov 2026)

| Area | Status | Notes |
|------|--------|-------|
| Auth-first student + portal | Done | `/` → login; dashboard after auth |
| Campus membership scoping | Done | Housing/food/market/AI scoped |
| Business apply → admin → setup → list | Done | Publish gate enforced |
| Housing MVP + maps + inspections | Done | Pilot seed inventory |
| Food pickup + vendor board | Done | Paystack charge deferred |
| Marketplace/services | Done | Enquiry-first |
| Admin reports/listings | Done | |
| Monetization | Stub | Tables + webhook stub |
| School tools (thin) | Done | Full suite → Study plan |
| Student APK | Not started | Track B |
| Cron reminders / email | Deferred | Notifications table ready |

---

*End of implementation plan v1.1*
