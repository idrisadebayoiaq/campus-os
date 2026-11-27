import Image from "next/image";
import Link from "next/link";
import { DownloadButtons } from "@/components/download-buttons";
import { MockBubble, MockRow, PhoneMock } from "@/components/phone-mock";
import { APP_VERSION, PORTAL_URL } from "@/lib/downloads";

export const metadata = {
  title: "CampusOS — Campus life that fits your school",
  description:
    "For students in school and students preparing for JAMB, WAEC or NECO: housing, rent reminders, food, marketplace, wallet, AI tutoring and past questions. Download CampusOS for Android and iOS.",
};

const STATS = [
  { value: "2 journeys", label: "In-school students and exam candidates" },
  { value: "AI tutor", label: "For your courses or your exam subjects" },
  { value: "Rent alerts", label: "A month, a week, 3 days and 24 hours ahead" },
  { value: "Free", label: "Download and start in minutes" },
] as const;

const JOURNEYS = [
  {
    badge: "In school",
    title: "Already at your campus",
    body: "Everything for the campus day, scoped to your school.",
    points: [
      "Wallet with card top-up, plus Premium for higher limits",
      "Housing with real move-in costs, inspection booking and agent chat",
      "Your Apartment in Settings: photos, details, rent receipts and due dates",
      "Rent reminders a month, a week, 3 days and 24 hours before it's due",
      "Order from campus restaurants with menus, photos, options and live order status",
      "Marketplace with safe pickup codes, plus chat you can clear or delete",
      "Study Hub, class rooms, lecturers' announcements and an AI tutor for your courses",
    ],
  },
  {
    badge: "Exam prep",
    title: "Preparing for JAMB, WAEC or NECO",
    body: "Study toward your exam, and get ready for the school you're aiming for.",
    points: [
      "Set your exams, subjects, exam date, and the school and campus you want",
      "AI tutor that teaches to the syllabus and drills you with exam-style questions",
      "Past questions and a Study tab built around your goals",
      "Browse housing around your target school before you get admitted",
      "Marketplace for the things you'll need in school, from your target campus",
      "Switch to the full in-school app when you're admitted",
    ],
  },
] as const;

const FEATURES = [
  {
    icon: "🏠",
    title: "Campus housing",
    body: "Browse rooms near your school with the full move-in cost — rent, agent fee, caution and more — before you ever visit.",
  },
  {
    icon: "📚",
    title: "Study Hub",
    body: "Timetable, calendar, CGPA tracker, flashcards, library and a focus timer in one calm workspace.",
  },
  {
    icon: "🤖",
    title: "AI study tutor",
    body: "Ask questions, get step-by-step explanations and quiz yourself on the courses you actually take.",
  },
  {
    icon: "🍔",
    title: "Food & vendors",
    body: "Order like in a restaurant app: photo menus, add-ons, deals, delivery or pickup, and live status from accepted to ready. (In-school students.)",
  },
  {
    icon: "🔑",
    title: "My apartment & rent alerts",
    body: "Once you collect your keys, your house moves into Settings with its photos, details and receipts, and we remind you before every rent date.",
  },
  {
    icon: "🎯",
    title: "Exam prep mode",
    body: "Preparing for JAMB, WAEC or NECO? Set your goals, practise past questions and scout housing and the market near your target school.",
  },
  {
    icon: "💳",
    title: "Wallet & Premium",
    body: "Top up with a card, pay for orders and rent items from one wallet, and unlock higher AI limits with Premium.",
  },
  {
    icon: "🛍️",
    title: "Student marketplace",
    body: "Buy and sell textbooks, gadgets and services with students at your own school.",
  },
  {
    icon: "💬",
    title: "Inbox & calls",
    body: "Chat with classmates, agents and businesses, then switch to voice or video. Delete messages and clear or remove chats whenever you like.",
  },
  {
    icon: "🔔",
    title: "Reminders that matter",
    body: "Viewings, orders and rent dates arrive as notifications, and you can clear them one by one or all at once.",
  },
  {
    icon: "🎓",
    title: "Classes & lecturers",
    body: "Join class rooms, get announcements from your lecturers and school, and never miss a deadline.",
  },
  {
    icon: "✅",
    title: "Verified students",
    body: "Student verification keeps communities and marketplaces safer for everyone on campus.",
  },
] as const;

const STEPS = [
  {
    title: "Download the app",
    body: "Install CampusOS from the Play Store, App Store, or grab the latest Android APK below.",
  },
  {
    title: "Pick your campus",
    body: "Choose your Nigerian tertiary institution so everything you see is scoped to your school.",
  },
  {
    title: "Run your campus day",
    body: "Find housing, plan your week, study with AI, order food, and message anyone — all in one place.",
  },
] as const;

const AUDIENCES = [
  {
    title: "Students",
    body: "Everything for the campus day in your pocket: study, housing, food, marketplace and chat.",
  },
  {
    title: "Businesses",
    body: "Housing providers and vendors list on CampusOS, manage orders and inspections, and reach students at the right school.",
  },
  {
    title: "Lecturers & schools",
    body: "Run classes, verify students, and send announcements straight to the phones of your students.",
  },
] as const;

const FAQ = [
  {
    q: "Is CampusOS free?",
    a: "Yes. Downloading and using the student app is free. Businesses and schools manage their presence through the CampusOS Portal.",
  },
  {
    q: "I'm preparing for JAMB, WAEC or NECO. Can I use CampusOS?",
    a: "Yes. Choose exam prep when you sign up, set your exams, subjects and target school, and you get the AI tutor, past questions, and housing and marketplace browsing around that school. Food ordering is switched off in prep mode.",
  },
  {
    q: "Will CampusOS remind me when my rent is due?",
    a: "Yes. Once your agent hands over your house, you get reminders a month, a week, 3 days and 24 hours before rent is due, then on the day and if it becomes overdue.",
  },
  {
    q: "Where do I find my apartment after I move in?",
    a: "Open Settings, then Apartment. You'll see your current house with photos and details, plus rent dates and receipts. Tap Find new house to return to the housing marketplace.",
  },
  {
    q: "Which schools does it support?",
    a: "CampusOS is built for Nigerian tertiary institutions. You choose your school during setup, and your feed is personalised to it.",
  },
  {
    q: "Does it work offline?",
    a: "Your timetable, notes and flashcards stay available offline and sync when you're back online.",
  },
  {
    q: "How do I install the Android APK?",
    a: "Tap Download APK below, open the file, and allow installs from your browser if Android asks. Store versions will appear here as soon as they go live.",
  },
  {
    q: "I run a business or teach — where do I sign up?",
    a: "Use the CampusOS Portal. Businesses apply and get reviewed by CampusOS admin; lecturers apply with their school email for verification.",
  },
] as const;

function SectionHeading({
  eyebrow,
  title,
  body,
  center = false,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  center?: boolean;
}) {
  return (
    <div className={`max-w-2xl space-y-3 ${center ? "mx-auto text-center" : ""}`}>
      <p className="text-sm font-semibold tracking-wide text-accent">{eyebrow}</p>
      <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h2>
      {body ? <p className="text-base leading-7 text-muted">{body}</p> : null}
    </div>
  );
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm leading-6 text-muted">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-on-accent">
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-hero-bg text-hero-fg">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_20%,rgba(171,159,242,0.4),transparent_55%),radial-gradient(ellipse_at_85%_75%,rgba(255,253,248,0.1),transparent_50%)]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="anim-fade-up space-y-7">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-hero-fg ring-1 ring-white/15">
              <span className="h-2 w-2 rounded-full bg-accent" />
              Built for Nigerian students · v{APP_VERSION}
            </span>
            <h1 className="max-w-xl text-[2.35rem] font-semibold leading-[1.1] tracking-tight text-hero-fg sm:text-5xl lg:text-6xl">
              Your whole campus,{" "}
              <span className="text-accent">in one app</span>
            </h1>
            <p className="max-w-lg text-base leading-7 text-hero-muted sm:text-lg">
              In school or preparing for JAMB, WAEC and NECO: find housing, study with
              an AI tutor, get rent reminders, order food and chat with anyone on campus.
              Personalised the moment you pick your journey.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/#download"
                className="inline-flex h-12 items-center justify-center rounded-full bg-accent px-7 text-sm font-semibold text-on-accent transition hover:opacity-90"
              >
                Download the app
              </Link>
              <Link
                href="/#features"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/25 px-7 text-sm font-medium text-hero-fg transition hover:bg-white/10"
              >
                See what&apos;s inside
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-sm text-hero-muted">
              <span>✓ Free to download</span>
              <span>✓ Android &amp; iOS</span>
              <span>✓ Works with your school</span>
            </div>
          </div>

          <div className="anim-fade-up-delay relative mx-auto flex w-full max-w-md justify-center lg:max-w-none">
            <PhoneMock title="Good morning" className="anim-float relative z-10 lg:-rotate-3">
              <MockRow title="Today's timetable" meta="CSC 301 · 10:00 · LT2" badge="Next" />
              <MockRow title="CGPA tracker" meta="Current 4.32 / 5.00" />
              <MockRow title="Room near campus" meta="₦180k · caution included" badge="New" />
              <MockRow title="AI tutor" meta="Ask anything about your course" />
            </PhoneMock>
            <PhoneMock
              title="Inbox"
              className="absolute -bottom-6 -left-2 hidden w-56 rotate-6 opacity-95 sm:block lg:-left-10"
            >
              <MockBubble>Is the room still available?</MockBubble>
              <MockBubble mine>Yes! Inspection tomorrow 4pm.</MockBubble>
            </PhoneMock>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-b border-border bg-bg">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.value} className="space-y-1">
              <p className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                {s.value}
              </p>
              <p className="text-sm text-muted">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Two journeys */}
      <section id="journeys" className="scroll-mt-20 border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20 sm:px-6">
          <SectionHeading
            center
            eyebrow="Two ways to use CampusOS"
            title="Whether you're in school or still preparing"
            body="Pick what fits you when you sign up. The app reshapes itself around your journey."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {JOURNEYS.map((j) => (
              <div key={j.badge} className="rounded-[1.75rem] bg-bg p-7 ring-1 ring-border">
                <span className="inline-flex rounded-full bg-accent px-3 py-1 text-xs font-semibold text-on-accent">
                  {j.badge}
                </span>
                <h3 className="mt-4 text-xl font-semibold text-fg">{j.title}</h3>
                <p className="mt-1 text-sm text-muted">{j.body}</p>
                <ul className="mt-5 space-y-3">
                  {j.points.map((p) => (
                    <Check key={p}>{p}</Check>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 bg-bg">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20 sm:px-6">
          <SectionHeading
            center
            eyebrow="Everything you need"
            title="One app for the whole campus day"
            body="Stop juggling WhatsApp groups, notes apps and random listings. CampusOS brings it together and keeps it scoped to your school."
          />
          <div className="mt-10 grid gap-4 sm:mt-14 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-[1.75rem] bg-surface p-6 ring-1 ring-border transition hover:-translate-y-1 hover:ring-accent"
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-2xl">
                  {f.icon}
                </span>
                <h3 className="mt-4 text-base font-semibold text-fg">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Deep dive: housing */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:py-20 sm:px-6 lg:grid-cols-2">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Housing"
              title="Know the real cost before you move in"
              body="No more surprise fees. Every listing shows rent plus agent fee, caution, legal and more — so the number you see is the number you pay."
            />
            <ul className="space-y-3">
              <Check>Total move-in cost on every listing</Check>
              <Check>Book inspections and message agents in the app</Check>
              <Check>Exam candidates can browse housing around their target school</Check>
              <Check>Rooms near the school you actually attend</Check>
            </ul>
          </div>
          <div className="flex justify-center">
            <PhoneMock title="Housing near you">
              <MockRow title="Self-contain, 2 min walk" meta="₦200k rent · ₦260k total" badge="Verified" />
              <MockRow title="Shared apartment" meta="₦90k rent · ₦130k total" />
              <MockRow title="Hostel bed space" meta="₦60k rent · ₦75k total" />
              <MockRow title="Book an inspection" meta="Pick a date and time" badge="Go" />
            </PhoneMock>
          </div>
        </div>
      </section>

      {/* Deep dive: apartment + rent reminders */}
      <section className="bg-bg">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:py-20 sm:px-6 lg:grid-cols-2">
          <div className="order-2 flex justify-center lg:order-1">
            <PhoneMock title="Apartment">
              <MockRow title="Self-contain, Gate Area" meta="Your current home" badge="Active" />
              <MockRow title="Next rent" meta="Due in 24 hours · ₦180k" badge="Soon" />
              <MockRow title="Receipts & move-in checklist" meta="Everything in one place" />
              <MockRow title="Find new house" meta="Back to the housing marketplace" badge="Go" />
            </PhoneMock>
          </div>
          <div className="order-1 space-y-6 lg:order-2">
            <SectionHeading
              eyebrow="Your home, handled"
              title="After you collect your keys, the app follows you home"
              body="Housing steps out of your tab bar and your apartment moves into Settings, with its photos, details and rent dates. Moving on? One tap takes you back to the marketplace."
            />
            <ul className="space-y-3">
              <Check>Your current house with photos, rent and agent details</Check>
              <Check>Rent reminders a month, a week, 3 days and 24 hours ahead</Check>
              <Check>Rent receipts and a move-in checklist you can tick off</Check>
              <Check>Message your agent or find a new house in one tap</Check>
            </ul>
          </div>
        </div>
      </section>

      {/* Deep dive: study */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:py-20 sm:px-6 lg:grid-cols-2">
          <div className="order-2 flex justify-center lg:order-1">
            <PhoneMock title="Study Hub">
              <MockRow title="Timetable" meta="3 classes today" />
              <MockRow title="Flashcards" meta="24 cards due" badge="Review" />
              <MockRow title="Focus timer" meta="25 min deep work" />
              <MockBubble>Explain Big-O like I&apos;m new</MockBubble>
              <MockBubble mine>Think of it as how work grows as input grows…</MockBubble>
            </PhoneMock>
          </div>
          <div className="order-1 space-y-6 lg:order-2">
            <SectionHeading
              eyebrow="Study"
              title="Study smarter with tools that fit tertiary life"
              body="Plan your week, track your CGPA, revise with flashcards and get unstuck with an AI tutor tuned for your courses."
            />
            <ul className="space-y-3">
              <Check>Timetable, calendar and exam reminders</Check>
              <Check>CGPA tracker and course planner</Check>
              <Check>Flashcards, library and focus timer</Check>
              <Check>AI tutor for explanations and practice questions</Check>
            </ul>
          </div>
        </div>
      </section>

      {/* Deep dive: exam prep */}
      <section id="exam-prep" className="scroll-mt-20 bg-bg">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:py-20 sm:px-6 lg:grid-cols-2">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Exam prep"
              title="Get exam-ready and school-ready at the same time"
              body="Preparing for JAMB, WAEC or NECO? Tell CampusOS your exams, subjects and the school you want, and the app is built around that."
            />
            <ul className="space-y-3">
              <Check>Exam goals: your exams, subjects, date, target school and course</Check>
              <Check>AI tutor that drills you with exam-style questions and explains the answers</Check>
              <Check>Past questions and a Study tab for daily practice</Check>
              <Check>Browse housing and the marketplace around your target campus</Check>
              <Check>No food ordering in prep mode, so nothing distracts you from the books</Check>
            </ul>
          </div>
          <div className="flex justify-center">
            <PhoneMock title="Exam goals">
              <MockRow title="JAMB · WAEC" meta="Maths, English, Physics, Chemistry" />
              <MockRow title="Target school" meta="Osun State University · Osogbo" badge="Set" />
              <MockRow title="Past questions" meta="Practise by subject" badge="New" />
              <MockBubble>Give me 3 JAMB-style questions on algebra</MockBubble>
              <MockBubble mine>Question 1: If 2x + 3 = 11, what is x?</MockBubble>
            </PhoneMock>
          </div>
        </div>
      </section>

      {/* Deep dive: market + inbox */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:py-20 sm:px-6 lg:grid-cols-2">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Food, market & chat"
              title="Buy, sell and talk — all on campus"
              body="Order from vendors you trust, sell what you don't need, and keep every conversation in one inbox with voice and video calls built in."
            />
            <ul className="space-y-3">
              <Check>Restaurant-style ordering: photo menus, add-ons, deals, pickup or delivery</Check>
              <Check>Live order status from accepted to ready (in-school students)</Check>
              <Check>Peer-to-peer marketplace scoped to your school</Check>
              <Check>Direct messages, group chats and calls, with delete and clear</Check>
            </ul>
          </div>
          <div className="flex justify-center">
            <PhoneMock title="Marketplace">
              <MockRow title="Calculus textbook" meta="₦6,500 · Used, good" badge="Hot" />
              <MockRow title="Jollof & chicken" meta="Mama Put · 15 min" />
              <MockRow title="Laptop stand" meta="₦8,000 · Same campus" />
              <MockBubble mine>Can we meet at the library?</MockBubble>
            </PhoneMock>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-bg">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20 sm:px-6">
          <SectionHeading
            center
            eyebrow="How it works"
            title="Up and running in three steps"
          />
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="relative rounded-[1.75rem] bg-surface p-7 ring-1 ring-border">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-hero-bg text-lg font-semibold text-hero-fg">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-lg font-semibold text-fg">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audiences */}
      <section className="bg-hero-bg text-hero-fg">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20 sm:px-6">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-semibold tracking-wide text-accent">One platform</p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Made for students, businesses and schools
            </h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {AUDIENCES.map((a) => (
              <div key={a.title} className="rounded-[1.75rem] bg-white/8 p-7 ring-1 ring-white/15">
                <h3 className="text-lg font-semibold">{a.title}</h3>
                <p className="mt-2 text-sm leading-6 text-hero-muted">{a.body}</p>
              </div>
            ))}
          </div>
          {PORTAL_URL ? (
            <div className="mt-10">
              <a
                href={PORTAL_URL}
                className="inline-flex h-12 items-center justify-center rounded-full bg-accent px-7 text-sm font-semibold text-on-accent transition hover:opacity-90"
              >
                Open the CampusOS Portal
              </a>
            </div>
          ) : null}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 bg-bg">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:py-20 sm:px-6">
          <SectionHeading center eyebrow="FAQ" title="Questions, answered" />
          <div className="mt-10 space-y-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl bg-surface px-5 py-4 ring-1 ring-border open:ring-accent"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-fg">
                  {item.q}
                  <span className="text-accent transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Download */}
      <section id="download" className="scroll-mt-20 bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:py-20 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:items-center">
          <div className="space-y-5">
            <Image
              src="/brand/mark.png"
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 rounded-2xl"
            />
            <SectionHeading
              eyebrow="Download"
              title="Get CampusOS on your phone"
              body={`Install from the stores when they're live, or grab the latest Android APK directly. Current build: v${APP_VERSION}.`}
            />
            <p className="text-sm text-muted">
              Businesses, lecturers and schools use the{" "}
              <span className="font-medium text-fg">CampusOS Portal</span> — students
              live in the mobile app.
            </p>
          </div>

          <div className="rounded-[2.25rem] bg-hero-bg p-6 text-hero-fg shadow-[0_24px_80px_rgba(60,49,91,0.25)] sm:p-8">
            <p className="text-sm text-hero-muted">Choose your install</p>
            <h3 className="mt-1 text-2xl font-semibold text-hero-fg">
              Play Store · App Store · APK
            </h3>
            <div className="mt-6">
              <DownloadButtons tone="onHero" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
