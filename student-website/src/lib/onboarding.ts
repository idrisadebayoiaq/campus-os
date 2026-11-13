export const STUDENT_STATUSES = [
  { value: "current", label: "I'm currently a student" },
  { value: "fresher", label: "I'm newly admitted / a fresher" },
  { value: "aspiring", label: "I'm applying or seeking admission" },
  { value: "alumni", label: "I'm a graduating student or alumnus" },
] as const;

export const INTEREST_OPTIONS = [
  { value: "housing", label: "Housing", href: "/housing" },
  { value: "study", label: "Study tools", href: "/study" },
  { value: "food", label: "Food", href: "/food" },
  { value: "marketplace", label: "Campus shopping", href: "/marketplace" },
  { value: "guides", label: "Campus guides", href: "/guides" },
] as const;

export const PROGRAMME_LEVELS: Record<string, string[]> = {
  undergraduate: ["100L", "200L", "300L", "400L", "500L", "600L"],
  nd: ["ND1", "ND2"],
  hnd: ["HND1", "HND2"],
  nce: ["NCE1", "NCE2", "NCE3"],
  postgraduate: ["PG Year 1", "PG Year 2", "MPhil/PhD"],
  other: ["Year 1", "Year 2", "Year 3", "Year 4"],
};

export const ONBOARDING_STEPS = ["status", "school", "academic", "interests", "done"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function levelsForProgrammeType(programmeType?: string | null) {
  const key = (programmeType || "undergraduate").toLowerCase();
  if (key.includes("nd") && !key.includes("hnd")) return PROGRAMME_LEVELS.nd;
  if (key.includes("hnd")) return PROGRAMME_LEVELS.hnd;
  if (key.includes("nce")) return PROGRAMME_LEVELS.nce;
  if (key.includes("post") || key.includes("msc") || key.includes("phd")) {
    return PROGRAMME_LEVELS.postgraduate;
  }
  if (key === "other") return PROGRAMME_LEVELS.other;
  return PROGRAMME_LEVELS.undergraduate;
}

export function prioritizeModules<T extends { href: string }>(
  modules: T[],
  interests: string[] | null | undefined,
  studentStatus?: string | null,
) {
  const interestOrder = interests?.length
    ? interests
    : studentStatus === "fresher" || studentStatus === "aspiring"
      ? ["housing", "guides", "food", "study", "marketplace"]
      : studentStatus === "alumni"
        ? ["marketplace", "guides", "housing", "study", "food"]
        : ["study", "housing", "food", "marketplace", "guides"];

  const rank = (href: string) => {
    const key = interestOrder.findIndex((i) => href.includes(i));
    return key === -1 ? 99 : key;
  };

  return [...modules].sort((a, b) => rank(a.href) - rank(b.href));
}

export const SETUP_CARDS = [
  {
    id: "add_courses",
    title: "Set up your semester",
    body: "Add your courses to unlock course workspaces, quizzes, and study groups.",
    href: "/study/courses",
  },
  {
    id: "add_timetable",
    title: "Add your timetable",
    body: "Save lecture times so CampusOS can surface today’s classes on Study Hub.",
    href: "/study/timetable",
  },
  {
    id: "set_housing_budget",
    title: "Looking for accommodation?",
    body: "Set a budget and preferred area to discover matching rooms.",
    href: "/profile?setup=housing",
  },
  {
    id: "set_study_goal",
    title: "Set a study goal",
    body: "Tell CampusOS your academic goal so AI and planners can adapt.",
    href: "/profile?setup=study",
  },
] as const;
