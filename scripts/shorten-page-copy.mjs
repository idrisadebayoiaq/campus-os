import fs from "node:fs";
import path from "node:path";

const root = "d:/campus-os/student-website/src/app";

/** @type {[RegExp, string][]} */
const replacements = [
  [
    /description="All 4 steps are optional\. Skip any \(or all\) and finish later in Profile & settings — Study and the rest of CampusOS stay open\."/g,
    'description="Optional — skip anytime."',
  ],
  [
    /description="Complete skipped onboarding steps here anytime — school, academics, interests, and preferences\. Nothing is locked\."/g,
    'description="School, academics, and preferences."',
  ],
  [
    /description="WhatsApp-style chats for CampusOS support, housing, food, and marketplace follow-ups\."/g,
    'description="Chats and updates."',
  ],
  [
    /description="CampusOS marketplace stays scoped to your selected school\."/g,
    'description="Pick a school first."',
  ],
  [
    /description="Student goods and campus services for your school will show here\."/g,
    'description="No listings yet."',
  ],
  [
    /description="Used goods and campus services around the school you picked on CampusOS\."/g,
    'description="Goods and services on your campus."',
  ],
  [
    /description="CampusOS only shows food vendors serving the school you selected\."/g,
    'description="Pick a school first."',
  ],
  [
    /description="Approved restaurants that finish setup will appear here for pickup orders\."/g,
    'description="No vendors yet."',
  ],
  [
    /description="Pickup menus from CampusOS vendors around your selected campus\."/g,
    'description="Pickup near your campus."',
  ],
  [
    /description="CampusOS guide — example ranges only\. Always inspect before paying rent\."/g,
    'description="Example ranges — inspect before paying."',
  ],
  [
    /description="CampusOS scopes housing to the school you pick so results stay nearby and relevant\."/g,
    'description="Pick a school first."',
  ],
  [
    /description="Try widening filters, or check back after landlords publish near your school\."/g,
    'description="No matches — widen filters."',
  ],
  [
    /description="CampusOS shows verified rooms around the school you selected — with full fee breakdowns\."/g,
    'description="Rooms near your campus."',
  ],
  [
    /description="This listing belongs to another campus\. CampusOS keeps search scoped to your selected school\."/g,
    'description="Outside your campus."',
  ],
  [
    /description="CampusOS will publish honest campus guides as pilots expand\."/g,
    'description="No guides yet."',
  ],
  [
    /description="School-scoped orientation pages for housing and campus life on CampusOS\."/g,
    'description="Campus orientation."',
  ],
  [
    /description="Fast signup first\. CampusOS then asks a few short optional steps so your dashboard matches your school and goals\."/g,
    'description="Create your student account."',
  ],
  [
    /description="CampusOS study insights need your account\."/g,
    'description="Log in to continue."',
  ],
  [
    /description="CampusOS habit view — balance study time; do not chase endless screen time\."/g,
    'description="Study habits overview."',
  ],
  [/description="Revision library scoped to your campus\."/g, 'description="Revision library."'],
  [/description="Find mentors or offer to tutor courses you know\."/g, 'description="Find or offer tutoring."'],
  [/description="Course communities — create, join, and post\."/g, 'description="Course communities."'],
  [
    /description="Explain, practice, step-by-step teaching, and note summaries\."/g,
    'description="Tutor, practice, summarize."',
  ],
  [
    /description="Pomodoro 25\/5 — logs study_sessions when a block completes\."/g,
    'description="Pomodoro focus sessions."',
  ],
  [/description="Timed quizzes with review and attempt history\."/g, 'description="Timed practice."'],
  [/description="Spaced repetition decks and review\."/g, 'description="Review decks."'],
  [/description="Personal notes, links, and summaries\."/g, 'description="Your notes."'],
  [/description="Track grades, targets, and final projections\."/g, 'description="Grades and targets."'],
  [/description="Block out revision and focus time\."/g, 'description="Study blocks."'],
  [
    /description="Semester milestones, personal reminders, and campus events\."/g,
    'description="Semester dates."',
  ],
  [/description="Exam dates with countdown timers\."/g, 'description="Upcoming exams."'],
  [/description="Track deadlines and mark tasks complete\."/g, 'description="Deadlines."'],
  [/description="Weekly lectures with overlap warnings\."/g, 'description="Weekly lectures."'],
  [
    /description="Course workspace: schedule, tasks, syllabus, and progress\."/g,
    'description="Course workspace."',
  ],
  [/description="Your courses sync to your CampusOS account\."/g, 'description="Log in to continue."'],
  [/description="Register courses and open a workspace for each one\."/g, 'description="Your registered courses."'],
  [
    /description="CampusOS keeps your timetable, CGPA, and AI tutor on your account\."/g,
    'description="Log in to continue."',
  ],
  [
    /description="Your academic space on CampusOS — scoped to your school\."/g,
    'description="Tools for your semester."',
  ],
  [
    /description="Student access to housing, food, school tools, and inbox\."/g,
    'description="Student access."',
  ],
  [
    /description="The Android app will mirror this student website\. Businesses should not use the APK — they use the CampusOS business portal\."/g,
    'description="Android app coming soon."',
  ],
  [
    /description="CampusOS hides marketplace posts that are not for the school you selected\."/g,
    'description="Outside your campus."',
  ],
  [
    /description="CampusOS hides food vendors that are not tied to your selected school\."/g,
    'description="Outside your campus."',
  ],
  [/description="Pickup orders only on CampusOS for now\."/g, 'description="Pickup only."'],
  [
    /description="Public business profile\. Bank and ID documents are never shown here\."/g,
    'description="Public profile."',
  ],
];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name === "page.tsx") {
      let s = fs.readFileSync(p, "utf8");
      let changed = false;
      for (const [re, to] of replacements) {
        const next = s.replace(re, to);
        if (next !== s) {
          s = next;
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(p, s);
        console.log("updated", path.relative(root, p));
      }
    }
  }
}

walk(root);
