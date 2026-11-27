import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";

/**
 * Which kind of student this is decides which features they see:
 *  - "enrolled": in school (courses, timetable, classes, housing, AI tutor free with a limit)
 *  - "exam_prep": preparing for JAMB, WAEC, NECO or similar (exam countdown and plan; AI tutor and
 *    past questions come with Premium)
 */
export type StudentKind = "enrolled" | "exam_prep";

export type ExamGoals = {
  exams: string[];
  subjects: string[];
  date: string | null;
  school: string | null;
  course: string | null;
  /** Campus of the school they want, used to show housing and marketplace listings there */
  campusId: string | null;
};

type Ctx = {
  kind: StudentKind;
  isExamPrep: boolean;
  goals: ExamGoals;
  /** True until the first read finishes for the signed-in user */
  loading: boolean;
  refresh: () => Promise<void>;
};

const EMPTY: ExamGoals = { exams: [], subjects: [], date: null, school: null, course: null, campusId: null };

const StudentKindContext = createContext<Ctx>({
  kind: "enrolled",
  isExamPrep: false,
  goals: EMPTY,
  loading: false,
  refresh: async () => undefined,
});

export const useStudentKind = () => useContext(StudentKindContext);

export function StudentKindProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [kind, setKind] = useState<StudentKind>("enrolled");
  const [goals, setGoals] = useState<ExamGoals>(EMPTY);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!uid) {
      setKind("enrolled");
      setGoals(EMPTY);
      setLoadedFor(null);
      return;
    }
    try {
      const { data } = await supabase
        .from("student_profiles")
        .select("kind, exam_targets, exam_subjects, exam_date, target_school, target_course, target_campus_id")
        .eq("user_id", uid)
        .maybeSingle();
      if (data) {
        setKind(data.kind === "exam_prep" ? "exam_prep" : "enrolled");
        setGoals({
          exams: (data.exam_targets as string[] | null) ?? [],
          subjects: (data.exam_subjects as string[] | null) ?? [],
          date: (data.exam_date as string | null) ?? null,
          school: (data.target_school as string | null) ?? null,
          course: (data.target_course as string | null) ?? null,
          campusId: (data.target_campus_id as string | null) ?? null,
        });
      } else {
        setKind("enrolled");
        setGoals(EMPTY);
      }
    } finally {
      setLoadedFor(uid);
    }
  }, [uid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loading = Boolean(uid) && loadedFor !== uid;
  const value = useMemo<Ctx>(
    () => ({ kind, isExamPrep: kind === "exam_prep", goals, loading, refresh }),
    [kind, goals, loading, refresh],
  );
  return <StudentKindContext.Provider value={value}>{children}</StudentKindContext.Provider>;
}
