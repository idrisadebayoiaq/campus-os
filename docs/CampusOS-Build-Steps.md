# CampusOS build steps

The step-by-step checklist for `CampusOS-Implementation-Plan.pdf`. Work top to bottom. Tick a step only when its "Done when" is true.

**Decisions already made**

- Keep the current colours.
- Tab bar: Home, Community, Market (Housing inside), AI Study, Chat.
- Every tutor pays Tutor Premium (₦3,000 a month, by card) to create rooms. Each room is free or paid.
- CampusOS takes no share of room payments. The tutor keeps the full price.
- Students pay for everything from the wallet. Businesses and tutors pay subscriptions by card and get paid to a linked bank account.

**Release routine for every phase**

1. Migrations applied, then checked with rolled-back tests (money and permissions).
2. Server functions deployed before the app that needs them.
3. `npx tsc --noEmit` clean in `student-app` (ignore the untracked `components/` and `constants/` templates) and `pnpm build` clean in `business-portal`.
4. Real-phone pass on a low-end Android.
5. New APK, `student-website/src/lib/downloads.ts` updated, commit and push.

---

## Phase 0: ship today's fixes

- [x] Held-purchase receipt shows after paying (`app/receipt.tsx`).
- [x] Students can read their own delivery codes (migration `20261128120000_food_code_select_grant.sql`).
- [x] White CampusOS logo as the notification icon (`assets/notification-icon.png`, `app.json`).
- [x] Branded splash on every launch (`src/components/brand-splash.tsx`).
- [x] AI Study tab opens the tutor chat without a blank loading screen (remembered chat id, chat draws before extra details load).
- [ ] Build APK 1.0.14 (versionCode 19) and update the website download link.

## Phase 1: school identity and roles

### 1.1 Database (one migration: `phase1_school_roles`)

- [x] `class_offerings`: add `level` and `join_approval`.
- [x] `class_enrollments`: add `source` (auto, code, manual, csv). Existing rows become `manual`, code joins become `code`.
- [x] `class_staff`: allow roles `class_rep` and `assistant_rep`; add `status` (invited, active, ended), `appointed_by`, `term_ends_on`.
- [x] `can_manage_class`: only lecturers, co-lecturers and TAs. Class reps get their own `is_class_rep` check, so they never reach grades.
- [x] New table `student_offices` (school, holder, office key, display title, scope and scope id, term dates, status, appointed by), with row-level security.
- [x] `class_attendance_sessions`: add `method`, `code_secret`, `opens_at`, `closes_at`, `taken_by`. New table for wrong-code attempts.
- [x] `school_announcements`: add `office_id`, `scope`, `scope_id`; notify only the people in that scope.
- [x] Functions:
  - [x] `complete_admission`: one step that saves the school, campus, department and level, switches a prep student to in-school, and runs class assignment. Used by onboarding and Got admitted.
  - [x] `auto_enroll_student_for_school` rewritten: level-aware, marks rows `auto`, removes auto rows from an old department.
  - [x] Trigger on `class_offerings`: when auto-join is on, enrol matching students already in the school.
  - [x] `school_students`: searchable student list for school authorities.
  - [x] `appoint_office`, `end_office`, `appoint_class_rep`, `remove_class_rep`, `respond_role_invite`.
  - [x] `profile_badges(user)`: active roles for display.
  - [x] `publish_class_announcement`: reps can post, marked as class rep.
  - [x] `post_office_announcement`: student leaders post to their scope, at most 3 a day per office.
  - [x] `open_code_attendance`, `attendance_code`, `close_attendance`, `mark_attendance_with_code`.
  - [x] Daily job: one "new students today" notification per school authority.
- [x] Follow-ups: `phase1_tighten` (class staff rules for signed-in users only), `phase1_class_overview` (the app's class page), `phase1_portal_lists` (`class_roster` with real names for lecturers, `school_leaders`).
- [x] Rolled-back tests pass (admission, rep limits, code attendance with lockout, authority-only lists, office invites and badges, scoped announcements, department change).
- **Done when:** rolled-back tests show a rep cannot read grades, an authority only sees their own school's students, a wrong attendance code is rejected and attempts are capped, and `complete_admission` either finishes fully or changes nothing.

### 1.2 Student app

- [x] Got admitted opens the school form with **no school preselected**, and only switches the account when the student confirms.
- [x] Onboarding: department picker from the school's departments (typing allowed if missing) and level chips. Required for Got admitted.
- [x] Onboarding and Got admitted both call `complete_admission`.
- [x] "My roles" screen (`app/roles.tsx`): invitations (accept or decline) and active roles.
- [x] Badges on the Profile tab and in chat info (`src/components/role-badges.tsx`).
- [x] Class screen (`app/study/class/[id].tsx`): reps can post announcements and open code attendance; students can mark attendance with the code.
- [x] Student leaders can post announcements to their scope from My roles.
- [ ] Phone test of the whole flow on the next APK.
- **Done when:** a prep test account goes through Got admitted, lands in the right classes, and the badge flow works end to end on a phone.

### 1.3 Portal

- [x] School › Students: search, filters (department, level, verified), appoint to an office.
- [ ] School › Students: faculty filter.
- [x] School › Student leaders: current office holders and class reps, end a term or cancel an invite.
- [ ] School › Student leaders: past office holders.
- [x] Classes: department and level, auto-add and join-approval switches, "Make class rep" on the students list, reps listed on the class, real student names on the roster.
- [x] Classes › Attendance: code attendance with a large rotating code for the projector, live count, close button.
- **Done when:** `pnpm build` passes and a school test account can appoint a president who then sees the badge in the app.

### 1.4 Ship

- [x] Type-check, build, commit, push.
- [ ] APK 1.1.0 and website link.

## Phase 2: chat and our own notifications

1. [ ] Spike (1 day): confirm Notifee (or equivalent) works with Expo SDK 58 / RN 0.88 for avatars, grouping and inline reply. Fallback: keep standard notifications with better channels and sounds.
2. [ ] Migration: `message_attachments`, `message_reactions`, `message_stars`, `polls`, `poll_votes`; `messages` gets new types, `reply_to_id`, `forwarded`; `conversations` gets kinds `room`, `class`, `request` and send permissions; `notifications` gets `category`, `actor_id`, `image_url`, `group_key`, `data`.
3. [ ] Private storage bucket for chat files with signed links; size limits (video 3 min / 50 MB, files 25 MB).
4. [ ] Chat screen: "+" sheet (photo, camera, video, file, location, contact, poll, share from CampusOS), upload progress, retry.
5. [ ] Reply, forward, react, edit (15 min), delete for everyone (1 h), star, search in chat, link previews, read receipts switch.
6. [ ] Chat tab split into Chats and Rooms; official classes appear in Rooms.
7. [ ] Message requests for people you are not connected to.
8. [ ] Notification channels with new names and bundled sounds (chime, message pop, cash, order, study).
9. [ ] Push dispatcher sends data messages for chats; the app draws rich notifications with avatar, grouping, Reply and Mark as read.
10. [ ] In-app banner component for foreground notifications.
11. [ ] Notification centre redesign (All, Mentions, Rooms, Money, School), app icon badge, quiet hours.
12. [ ] Battery optimisation guide (shown once).
13. [ ] Ship 1.2.0.

## Phase 3: tutors and rooms

1. [ ] Tutor application type in the portal (`business_type = tutor`), documents, admin review.
2. [ ] Tutor Premium plan (₦3,000, `tutor_plan_price` setting) using the existing plan billing; rooms pause when the plan lapses.
3. [ ] Migration: `rooms`, `room_members`, `room_schedule`, `room_sessions`, `room_subscriptions`; `room_share_pct` setting = 0.
4. [ ] Functions: `room_join` (audience check, wallet payment with payment password, receipt, tutor Pending credit), `room_renew` (daily job), `room_refund`, `start_room_session`, waitlist.
5. [ ] Portal tutor dashboard: rooms, create wizard (basics, audience, price, schedule with voice or video, rules, team, preview), members, earnings, payouts, reviews.
6. [ ] Student app: Community tab with Discover (sections, search, filters), room page, join and pay, waitlist.
7. [ ] Inside a room: Chat, Classes (join live voice or video), Files, Members, permissions like WhatsApp.
8. [ ] Timetable sync and reminders 15 minutes before each class.
9. [ ] Tab bar: Home, Community, Market (Housing moved inside), AI Study, Chat.
10. [ ] Invite links and QR codes; featured rooms in admin.
11. [ ] Ship 1.3.0.

## Phase 4: room extras

1. [ ] Quizzes (owner only): tables, server timer and marking, screenshot block, results and leaderboard.
2. [ ] Debates (owner only): set-up, live turns with automatic unmute, audience vote, AI summary.
3. [ ] Groups inside rooms.
4. [ ] Reviews (members who attended at least one class), tutor verification levels.
5. [ ] AI quiz drafts from notes; tutor insights; monthly statements.
6. [ ] Ship 1.4.0.

## Phase 5: Feeds and People

1. [ ] Migration: posts, media, likes, reposts, quotes, bookmarks, views, hashtags, follows, connections, privacy settings, moderation tables.
2. [ ] Server function for posting (verification, restrictions, rate limits, filters).
3. [ ] Feeds: For you, Following, Official; composer; threads; reply settings; trending hashtags; share previews.
4. [ ] People: search and filters, suggestions, follow, connect, message.
5. [ ] Prep student protections (separate prep spaces, no tutor DMs, minimal profile).
6. [ ] Moderation queue in the portal for schools and CampusOS staff; per-school switch.
7. [ ] Pilot at one campus, then ship 1.5.0.

## Phase 6: AI tutor upgrades

1. [ ] Study from my notes (upload, extract, Revise with me, Summarise, Flashcards, Practice questions).
2. [ ] Ask AI about a room or class file.
3. [ ] Catch me up in busy chats; missed-class recap.
4. [ ] Room recommender in Discover; study plan includes rooms.

## Phase 7: CampusOS Business app

1. [ ] New Expo app sharing tokens and data helpers with the student app.
2. [ ] Step A restaurants: orders board with loud alerts, delivery code, kitchen switch, sold-out, money.
3. [ ] Step B housing: viewings, offers, tenancies, rent.
4. [ ] Step C sellers, tutors, lecturers (offline attendance), school authority.
5. [ ] Quick actions (icon shortcuts, notification actions), offline cache and action queue.

## Phase 8: website

1. [ ] Download page for both apps with install steps and QR codes.
2. [ ] "Teach on CampusOS" and "For schools" pages.
3. [ ] Share preview pages for posts, rooms and profiles.

## Housekeeping

- [ ] Rotate the Mapbox secret token; remove secrets from `student-app/.env`.
- [ ] Change the demo portal password; delete test accounts.
- [ ] Redeploy the portal and website.
- [ ] Remove the `/my-room` link in `apartment.tsx` and the unused premium badge export.
