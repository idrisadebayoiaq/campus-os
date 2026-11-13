# CampusOS — Student Study Tools & Academic Features Implementation Plan

**Version:** 1.1  
**Date:** November 2026  
**Status:** S0–S5 web MVP implemented — polish + APK parity remaining  
**Depends on:** Auth, campus membership, black/white student dashboard, OpenRouter env  
**Surfaces:** Student website first (`student-website/`), then Track B APK parity  
**Default AI model:** `deepseek/deepseek-v4.1-flash` via OpenRouter (cheapest strong tutoring/summarization tier; override with `CAMPUSOS_STUDY_MODEL`)  

---

## 0. Product intent (locked)

CampusOS study tools are a **digital study companion** from first semester to graduation — not a timetable/CGPA-only page.

| Principle | Rule |
|-----------|------|
| Course-centric | Every tool hangs off a **Course Workspace** (e.g. CSC 201) |
| Campus-scoped | Institution / campus / department / level personalize defaults |
| No re-entry | School, campus, courses entered once power planner, AI, exams, groups |
| Learning aid | AI is a tutor/aid — never guaranteed course authority; never completes graded exams |
| Free core | Organization tools stay free; AI/heavy compute can be rate-limited / premium |
| Retention | Housing acquires; food/services habit; **study keeps CampusOS installed** |

**Out of scope until later:** school portal scraping, exam impersonation helpers, unlimited AI without cost controls, offline-first APK sync (Track B).

---

## 1. Information architecture

### Student app Study hub (`/school` → evolve to `/study`)

```
/study                         Study Hub (today + shortcuts)
/study/courses                 Registered courses
/study/courses/[courseId]      Course Workspace
/study/timetable               Lecture timetable
/study/assignments             Assignment & deadline manager
/study/exams                   Exam timetable + countdown
/study/calendar                Academic calendar
/study/planner                 Personal study planner
/study/cgpa                    GPA/CGPA + target planner
/study/library                 Personal study library
/study/past-questions          Past questions library
/study/flashcards              Flashcards decks
/study/cbt                     CBT / mock exams
/study/focus                   Focus timer
/study/ai                      AI tutor / companion
/study/groups                  Course study groups
/study/tutors                  Peer tutoring
```

Nav: keep **School** label or rename to **Study** once Phase 1 ships. Dashboard card points here.

### Course Workspace (canonical object)

One course row powers:

| Panel | Linked features |
|-------|-----------------|
| Schedule | Lectures, exams |
| Materials | Notes, syllabus, library items |
| Study | AI tutor, quizzes, flashcards |
| Tasks | Assignments, goals |
| Community | Groups, tutors |
| Progress | Grades, mastery, CBT scores |

---

## 2. Feature catalog (30) → build IDs

### Category 1 — Academic planning & organization

| ID | Feature | Phase | Free/Premium |
|----|---------|-------|--------------|
| S01 | Smart Lecture Timetable | 1 | Free |
| S02 | Assignment & Deadline Manager | 1 | Free |
| S03 | Examination Timetable & Countdown | 1 | Free |
| S04 | Academic Calendar | 1 | Free |
| S05 | Course Registration Organizer | 1 | Free |
| S06 | Personal Study Planner | 1 | Free |

### Category 2 — AI-powered learning

| ID | Feature | Phase | Free/Premium |
|----|---------|-------|--------------|
| S07 | AI Personal Tutor (+ Teach Me Step-by-Step) | 4 | Free tier + premium limits |
| S08 | Lecture Note Summarizer | 4 | Premium-leaning |
| S09 | Smart Flashcards (manual + spaced repetition) | 2 | Free basic / premium gen |
| S10 | AI Quiz Generator | 3 | Free low volume / premium |
| S11 | AI Study Companion (conversational) | 4 | Free tier + premium |
| S12 | Voice Lecture-to-Notes | 4 | Premium |

### Category 3 — Exam preparation

| ID | Feature | Phase | Free/Premium |
|----|---------|-------|--------------|
| S13 | Past Questions Library | 2 | Free |
| S14 | CBT Practice & Mock Examinations | 3 | Free basic |
| S15 | Personalized Revision Planner | 3 | Free |
| S16 | Topic Mastery Tracker | 3 | Free |
| S17 | Exam Performance Analyzer | 3 | Free basic / premium AI insights |
| S18 | Exam Revision Packs | 3–4 | Premium when AI-built |

### Category 4 — Performance & CGPA

| ID | Feature | Phase | Free/Premium |
|----|---------|-------|--------------|
| S19 | GPA & CGPA Calculator (configurable scales) | 1 | Free |
| S20 | Academic Progress Dashboard | 1–5 | Free |
| S21 | Target CGPA Planner | 1 | Free |
| S22 | Grade Projection Calculator | 1 | Free |

### Category 5 — Materials & knowledge

| ID | Feature | Phase | Free/Premium |
|----|---------|-------|--------------|
| S23 | Personal Study Library | 2 | Free (storage caps) |
| S24 | Course Outline & Syllabus Tracker | 2 | Free |
| S25 | Smart Academic Search | 4 | Premium-leaning |

### Category 6 — Collaborative learning

| ID | Feature | Phase | Free/Premium |
|----|---------|-------|--------------|
| S26 | Course-Based Study Groups | 5 | Free |
| S27 | Peer Tutoring & Mentorship | 5 | Free listings; optional paid sessions off-platform first |
| S28 | Collaborative Study Sessions | 5 | Free |

### Category 7 — Focus & wellbeing

| ID | Feature | Phase | Free/Premium |
|----|---------|-------|--------------|
| S29 | Focus Timer & Study Sessions | 2 | Free |
| S30 | Study Habit & Productivity Insights | 5 | Free basic / premium insights |

---

## 3. Phased delivery

### Phase S0 — Study shell & course model (Week 0–1)

**Objective:** Replace thin `/school` with Study Hub + course registry.

#### Steps

1. Rename/route: keep `/school` as hub alias; add `/study/*` routes (or evolve in place).
2. Schema: `student_courses`, `grading_schemes`, extend profile with `department`, `level`, `semester`.
3. Study Hub UI: today lectures count, pending tasks, tool grid, upcoming list (match product mock).
4. Wire campus membership + department/level into hub copy.
5. Migrate existing `timetable_entries`, `academic_tasks`, `grade_entries` to course FKs where possible.

#### Exit gate S0

- [ ] Logged-in student with campus sees Study Hub (not marketing).
- [ ] Can add at least one course (code, title, units, semester).
- [ ] Existing timetable/tasks/CGPA still work under new hub.
- [ ] RLS: students only read/write own academic rows.

---

### Phase S1 — Academic Foundation (Essential)

**Features:** S01–S06, S19, S21, S22 (+ S20 basic)

#### S01 Smart Lecture Timetable

- CRUD: course, day, start/end, venue, lecturer.
- Daily + weekly views; overlap warning.
- Optional later: image/PDF OCR extract (defer heavy OCR to S4 tooling).
- Share link / export to classmates (read-only token or copy text).

#### S02 Assignment & Deadline Manager

- Fields: course, title, description, due_at, status, attachments (Storage).
- Reminders via `notifications` + configurable offsets (1d, 3h).
- Photo-to-task OCR = Phase S4 add-on.

#### S03 Examination Timetable & Countdown

- Exam rows linked to course; venue/time; countdown on hub + course page.
- Feeds revision planner (S15) inputs.

#### S04 Academic Calendar

- Campus-level events table: `academic_calendar_events` (`official` | `community` labeled).
- Admin/moderator can seed official; students can propose community (moderation).

#### S05 Course Registration Organizer

- Track registered courses, units, compulsory/elective, status (`planned` | `registered` | `dropped`).
- Explicit copy: **does not replace school portal**.

#### S06 Personal Study Planner

- Weekly blocks around free periods + exams + difficulty tags.
- Manual first; auto-suggest in S15.

#### S19 / S21 / S22 CGPA suite

- Configurable scale (5.0 uni, 4.0, polytechnic variants).
- Semester GPA + CGPA; target CGPA feasibility; “what do I need on the final?” projection.
- Always label **unofficial**.

#### Exit gate S1

- [ ] Timetable overlap detection works.
- [ ] Assignment due soon appears on Study Hub.
- [ ] Exam countdown visible.
- [ ] CGPA + target planner produce consistent math for seeded scale.
- [ ] Course workspace shows schedule + tasks for one course.

---

### Phase S2 — Learning Materials (High)

**Features:** S09 (manual), S13, S23, S24, S29

#### Steps

1. Storage bucket `study-library` (private, owner-only RLS).
2. Library: upload PDF/images/text notes; tag by course; bookmark.
3. Syllabus tracker: topics checklist from outline (manual topics first; extract later).
4. Flashcards: decks per course; manual Q/A; basic spaced repetition (`ease`, `due_at`).
5. Past questions: metadata library (institution, faculty, dept, course, session); upload allowed files; bookmark.
6. Focus timer: Pomodoro presets; log `study_sessions` duration.

#### Exit gate S2

- [ ] Student can upload a note and find it under a course.
- [ ] Syllabus checklist updates coverage %.
- [ ] Flashcard review session updates due dates.
- [ ] Past question search filters by campus/course.
- [ ] Focus session appears in history.

---

### Phase S3 — Examination Tools (High)

**Features:** S10, S14–S18

#### Steps

1. Question bank schema (`quiz_questions`, `cbt_attempts`, `cbt_answers`).
2. CBT: choose course, count, duration; timed UI; score + review explanations.
3. Topic mastery states: `not_started` | `learning` | `practising` | `mastered`.
4. Revision planner: generate sessions from exams + mastery + available hours.
5. Performance analyzer: charts of scores/weak topics over time.
6. Revision packs: bundle summary + flashcards + questions (manual pack first).

#### Exit gate S3

- [ ] Complete one mock CBT with review why correct/incorrect.
- [ ] Mastery updates after quiz/CBT.
- [ ] Planner creates sessions before an exam date.
- [ ] Analyzer shows ≥1 trend for a student with 3+ attempts.

---

### Phase S4 — AI Learning (Advanced)

**Features:** S07, S08, S11, S12, S25 (+ AI assist for S09/S10/S18)

#### Platform rules

- Use OpenRouter (already in `.env`); server-only keys.
- Always pass campus + course context in system prompt.
- **Refuse** graded exam completion / impersonation.
- Usage metering table `ai_usage_events` (tokens, feature, user).
- Free daily caps; premium raises caps (₦500–₦1,500/mo test band — validate later).
- Cache identical summarization hashes to cut cost.

#### S07 AI Personal Tutor

- Modes: Explain, Examples, Practice, **Teach Me Step-by-Step** (Socratic).
- Text / future voice input.

#### S08 Note Summarizer

- PDF/Doc/image → extract → summary, key points, definitions.
- Follow-up Q&A grounded in uploaded text; show “from your notes” disclaimer.

#### S11 Companion

- Multi-turn thread per course; store `ai_threads` / `ai_messages`.

#### S12 Voice Lecture-to-Notes

- Upload audio → transcription provider → summary; consent + storage limits.

#### S25 Smart Academic Search

- Search own library + syllabus topics (embeddings optional; start with FTS).

#### Exit gate S4

- [ ] Tutor answers are campus/course-scoped and refuse exam cheating.
- [ ] Usage caps enforce on free tier.
- [ ] Summarizer works on a short PDF/text fixture.
- [ ] Step-by-step mode asks ≥1 check question before advancing.

---

### Phase S5 — Collaboration & insights (Expansion)

**Features:** S20 polish, S26–S28, S30

#### Steps

1. Study groups by institution/dept/level/course; moderation + report.
2. Tutor profiles; request session; reviews; anti-cheat policy copy.
3. Collaborative sessions: invite, agenda, shared checklist.
4. Habit insights: streaks, weekly minutes (encourage balance, not grind).

#### Exit gate S5

- [ ] Join/leave a course group; post + report works.
- [ ] Tutor profile request creates notification.
- [ ] Shared session checklist syncs for members.
- [ ] Insights page shows week study time from focus logs.

---

## 4. Data model (minimum)

```text
grading_schemes (id, name, scale_max, letter_map jsonb)
student_courses (id, user_id, campus_id, code, title, units, semester, year, kind, status)
timetable_entries → + course_id, lecturer, location
academic_tasks → + course_id, attachments[], reminder_offsets[]
exam_entries (id, user_id, course_id, starts_at, venue, ...)
academic_calendar_events (id, campus_id, title, starts_at, source, status)
study_plan_blocks (id, user_id, course_id, starts_at, ends_at, kind)
grade_entries → + course_id, semester_key, scheme_id
assessment_components (for S22 projections)
study_library_items (id, user_id, course_id, title, storage_path, kind)
syllabus_topics (id, course_id, title, status, order)
flashcard_decks / flashcards / flashcard_reviews
past_question_docs (campus-scoped metadata + storage)
quiz_questions / cbt_attempts / cbt_answers
topic_mastery (user_id, course_id, topic_id, state, score)
revision_sessions
study_sessions (focus timer)
ai_threads / ai_messages / ai_usage_events
study_groups / study_group_members / study_group_posts
tutor_profiles / tutor_requests
collaborative_sessions / collaborative_checklist_items
```

All tables: RLS owner-or-member; staff moderation where needed.

---

## 5. API & jobs

| Endpoint / job | Purpose |
|----------------|---------|
| `POST /api/study/ai/tutor` | S07/S11 with caps |
| `POST /api/study/ai/summarize` | S08 |
| `POST /api/study/ai/quiz` | S10 |
| `POST /api/study/cbt/score` | Server-side CBT scoring |
| Cron: assignment/exam reminders | Insert `notifications` |
| Cron: flashcard due digest | Optional daily |

---

## 6. UX notes (Study Hub)

Match the product sketch:

- Header: **My Academic Space** / Your Study Hub  
- Stats: Today’s lectures · Pending tasks  
- Tool grid: Timetable, CGPA, AI Tutor, Past Questions, Focus, Notes, Mock CBT, Flashcards, Assignments  
- Upcoming list: assignments + revision sessions  
- Black/white CampusOS system; no purple gradients; cards only for interactive modules  

Course Workspace tabs: Schedule · Materials · Study · Tasks · Community · Progress  

---

## 7. Safeguards & compliance

- AI disclaimer on every tutor/summary surface.
- Past questions: only authorized / student-contributed with takedown path.
- Tutoring: ban exam impersonation / doing graded work for others.
- Uploads: private by default; virus/size limits.
- Community content: report → admin queue (reuse `reports`).

---

## 8. Monetization (study)

| Free | Premium (test ₦500–₦1,500/mo) |
|------|-------------------------------|
| Timetable, assignments, CGPA, planner | Higher AI caps |
| Basic flashcards, notes library | Advanced summarization / large docs |
| Basic CBT | AI revision packs, voice transcription |
| Focus timer | Advanced search + AI insights |

Provider housing subscriptions (Track A8) stay separate from student study premium.

---

## 9. Standout five (ship quality bar)

1. **AI Personal Tutor** (S07) — guided, step-by-step  
2. **Course Workspace** (S0/S1 glue)  
3. **CBT Practice** (S14) — review why, not only score  
4. **Intelligent Study Planner** (S06→S15)  
5. **CGPA Goal Planner** (S21)  

---

## 10. Execution checklist (start after Track A close)

### Block ST1 — Shell
1. [ ] Study Hub route + dashboard entry  
2. [ ] `student_courses` + grading schemes migration  
3. [ ] Course Workspace empty shell  

### Block ST2 — Foundation
4. [ ] Timetable daily/weekly + overlap  
5. [ ] Assignments + reminders  
6. [ ] Exams + countdown  
7. [ ] Academic calendar  
8. [ ] CGPA + target + projection  

### Block ST3 — Materials
9. [ ] Library + syllabus topics  
10. [ ] Flashcards SRS  
11. [ ] Past questions browse  
12. [ ] Focus timer logs  

### Block ST4 — Exams
13. [ ] CBT engine + review  
14. [ ] Mastery + revision planner  
15. [ ] Performance analyzer  

### Block ST5 — AI
16. [ ] Usage metering + caps  
17. [ ] Tutor + Teach Me mode  
18. [ ] Summarizer + companion threads  

### Block ST6 — Social
19. [ ] Groups + tutoring + shared sessions  
20. [ ] Habit insights  

### Block ST7 — Mobile
21. [ ] Expo Study tab parity (Track B)  
22. [ ] Offline notes/flashcards/timer sync  

---

## 11. Definition of done — Study MVP (end of S1)

1. Student logs in → dashboard → Study Hub.  
2. Registers courses for current semester.  
3. Sees today’s lectures and pending assignments.  
4. Has exam countdown for at least one course.  
5. Calculates unofficial CGPA and a target plan.  
6. Opens a Course Workspace that shows schedule + tasks together.  
7. No business/portal leakage into Study.  
8. CampusOS branding consistent; campus still scopes non-study campus services.  

---

## 12. Immediate next actions

1. Apply `student_courses` + exam/calendar migrations.  
2. Rebuild `/school` into Study Hub UI.  
3. Ship S01/S02/S03/S19 before any new AI spend.  
4. Keep existing OpenRouter study-assist as temporary S07 prototype behind caps.  
5. Do not start groups/tutoring until S1 exit gate passes.  

---

## 13. Document ownership

| Document | Purpose |
|----------|---------|
| `doc/CampusOS_Implementation_Plan.md` | Track A platform (housing/portal) |
| `doc/CampusOS_Study_Tools_Implementation_Plan.md` | **This file** — academic companion |
| `doc/CampusOS_Nigerian_Student_Platform_Complete_Blueprint.pdf` | Overall product vision |

---

*End of CampusOS Study Tools Implementation Plan v1.0*
