# CampusOS exam-prep plan (saved, not built yet)

Status: parked on purpose. Build when ready. Last updated 26 Nov 2026.

## 1. Free past questions: where they come from

CampusOS has a "Past questions" tool today, but it only stores notes a student types in. A real question bank for exam candidates (JAMB/UTME, WAEC, NECO, Post-UTME) is a separate feature.

| Source | What it gives | Limits |
|---|---|---|
| ALOC Station (aloc.com.ng) | JAMB/UTME 1997–2026, WAEC 1988–2021, NECO 2012–2024, some Post-UTME, REST API, TypeScript SDK | Free tier: 1,000 credits a month, 30 requests a minute, 1 credit per basic question request. Explanations cost more and need a paid tier. Add-on packs from ₦2,000. The old `questions.aloc.com.ng` API is closed to new sign-ups. |
| Small public datasets (GitHub, Hugging Face) | A few hundred to a thousand questions | Unclear or non-commercial licences. Too small. |
| University course papers | No free source | Must be uploaded by students, lecturers or class reps, with moderation. |

How to add it when we build it:
1. Create an ALOC account, generate an API key, store it as the Supabase edge-function secret `ALOC_API_KEY`. Never put it in the app.
2. Add an edge function `exam-questions` that calls ALOC and saves each question in our own table, so repeat requests cost no credits.
3. Read ALOC's terms first to confirm caching questions in our database is allowed. If not, pay for a snapshot licence.
4. App: pick exam, subject, year, then a timed practice or mock test, score, review wrong answers, optional AI explanation.
5. Keep the current screen as "My notes". Later add class-shared papers for university courses.

## 2. Exam-prep accounts (JAMB, WAEC, NECO, Post-UTME candidates)

Who: people who are not in a school yet, so they have no campus, no student ID and no timetable.

Signup: first question "I am... In school / Preparing for an exam". Exam candidates pick their exams (JAMB, WAEC, NECO, Post-UTME), subjects, exam date and target school and course.

What they get that in-school students do not:
- Home with an exam countdown, a daily study plan and a readiness score.
- Practice: past questions by subject and year, timed mock exams, score history, weak topics, review of wrong answers.
- AI tutor tuned to the exam syllabus (a prep mode in `study-tutor`).
- Study plan generator (subjects x days left), with the existing Focus timer and Study lock.
- Flashcards, notes, study groups (reused).
- Exam info hub: registration dates, requirements, cut-off marks, Post-UTME schools.
- Wallet and Premium (Premium = unlimited mocks and explanations).

Hidden for them: Courses, Timetable, CGPA, Classes, Lecturer tools, Verify student ID, campus housing and rent.

Graduation path: "I got admitted" switches the account to in-school (add campus, verify ID) and keeps all history.

Technical outline:
- DB: `student_profiles.kind` ('enrolled' | 'exam_prep'), `exam_targets`, `exam_attempts`, `exam_attempt_answers`, `exam_questions` (cache).
- Signup metadata `student_kind`; `handle_new_user` stores it. The tabs layout currently forces onboarding when there is no campus membership; exam-prep users must skip that check.
- App: a `useStudentKind()` value drives which Home sections, study tools and menu rows show. New routes under `/exam/*`.
- Update the Support assistant guide when this ships.


---

## Decided plan: two kinds of student (built)

Pricing (all editable in the portal under Payment settings):
- In school: Premium 2,000 per month. AI tutor is free with a limit (10 questions an hour, 30 a day). Past questions are not shown to in-school students. Premium triples the limit and adds the green badge, lower selling fee and priority support.
- Preparing for an exam (JAMB, WAEC, NECO, Post-UTME): Premium 4,000 per month. The AI tutor and past questions need Premium. Everything else (wallet, marketplace, flashcards, CBT practice, study plan, focus timer, notes, study groups, chat) is free.

Signup: a first screen asks "How will you use CampusOS?" (Already in school / Preparing for an exam). In school then gives name, email, password and location, then picks a school and campus. Exam candidates give name, email, password and the exams they are writing, and skip campus setup. Subjects, exam date, wanted school and course are added later under Exam goals.

Switching: an exam candidate who gets admitted uses Exam goals > "I have been admitted". This is one way only (so people cannot flip back to dodge the price) and forces school and campus setup.

What each kind sees:
- In school: Home with calendar, next class, CGPA, classes, courses; Housing tab; full Study Hub.
- Exam candidate: Home with exam countdown, study plan tools and a Premium unlock card; Study tab instead of Housing; a smaller Study Hub (planner, calendar, notes, past questions, flashcards, CBT practice, focus, AI tutor, groups, tutors, insights).

Still to build: a real past-question bank (ALOC Station import or own content) behind Premium, exam-style practice quizzes, and daily study-plan generation from subjects and exam date.

