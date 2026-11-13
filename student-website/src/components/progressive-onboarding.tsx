"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  INTEREST_OPTIONS,
  ONBOARDING_STEPS,
  STUDENT_STATUSES,
  levelsForProgrammeType,
  type OnboardingStep,
} from "@/lib/onboarding";
import { Button, Field, Input } from "@/components/ui";

type Campus = { id: string; name: string; city: string | null; state: string | null };
type Institution = {
  id: string;
  name: string;
  short_name: string | null;
  institution_type: string;
  campuses: Campus[] | Campus | null;
};

type Props = {
  institutions: Institution[];
  departments: { id: string; name: string; institution_id: string }[];
  sessions: { id: string; label: string; institution_id: string | null }[];
  initialStep?: string;
  studentStatus?: string | null;
};

function normalizeCampuses(raw: Institution["campuses"]): Campus[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

export function ProgressiveOnboarding({
  institutions,
  departments,
  sessions,
  initialStep,
  studentStatus: initialStatus,
}: Props) {
  const router = useRouter();
  const start = (ONBOARDING_STEPS.includes(initialStep as OnboardingStep)
    ? initialStep
    : "status") as OnboardingStep;

  const [step, setStep] = useState<OnboardingStep>(start);
  const [status, setStatus] = useState(initialStatus || "current");
  const [institutionType, setInstitutionType] = useState("university");
  const [institutionQuery, setInstitutionQuery] = useState("");
  const [institutionId, setInstitutionId] = useState(institutions[0]?.id || "");
  const [campusId, setCampusId] = useState("");
  const [facultyName, setFacultyName] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [programmeName, setProgrammeName] = useState("");
  const [programmeType, setProgrammeType] = useState("undergraduate");
  const [academicLevel, setAcademicLevel] = useState("100L");
  const [academicSession, setAcademicSession] = useState("");
  const [semester, setSemester] = useState("First");
  const [studyMode, setStudyMode] = useState("full-time");
  const [interests, setInterests] = useState<string[]>(["study", "housing"]);
  const [missingSchool, setMissingSchool] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const tertiaryInstitutions = useMemo(
    () =>
      institutions.filter((i) =>
        [
          "university",
          "polytechnic",
          "college_of_education",
          "college",
          "monotechnic",
          "other",
        ].includes(i.institution_type),
      ),
    [institutions],
  );

  const filteredInstitutions = useMemo(() => {
    const q = institutionQuery.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    return tertiaryInstitutions
      .filter((i) => i.institution_type === institutionType)
      .filter((i) => {
        if (!tokens.length) return true;
        const hay = `${i.name} ${i.short_name || ""}`.toLowerCase();
        // Match full query or every token (so "unio sun" / "osun uni" still work)
        return hay.includes(q) || tokens.every((t) => hay.includes(t));
      })
      .sort((a, b) => {
        if (!q) return a.name.localeCompare(b.name);
        const aHay = `${a.name} ${a.short_name || ""}`.toLowerCase();
        const bHay = `${b.name} ${b.short_name || ""}`.toLowerCase();
        const aExact = a.short_name?.toLowerCase() === q || a.name.toLowerCase() === q ? 0 : 1;
        const bExact = b.short_name?.toLowerCase() === q || b.name.toLowerCase() === q ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        const aStarts = aHay.startsWith(q) || (a.short_name || "").toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = bHay.startsWith(q) || (b.short_name || "").toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.name.localeCompare(b.name);
      });
  }, [tertiaryInstitutions, institutionType, institutionQuery]);

  const activeInstitution =
    filteredInstitutions.find((i) => i.id === institutionId) ||
    filteredInstitutions[0] ||
    null;
  const campuses = normalizeCampuses(activeInstitution?.campuses);
  const activeCampusId =
    (campusId && campuses.some((c) => c.id === campusId) ? campusId : null) ||
    campuses[0]?.id ||
    "";
  const deptOptions = departments.filter((d) => d.institution_id === (activeInstitution?.id || ""));
  const sessionOptions = sessions.filter(
    (s) => !s.institution_id || s.institution_id === (activeInstitution?.id || ""),
  );
  const levels = levelsForProgrammeType(programmeType);

  const stepIndex = ONBOARDING_STEPS.indexOf(step);

  async function saveProgress(nextStep: OnboardingStep, completed: string[], skipped: string[] = []) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Please log in first.");

    const { data: existing } = await supabase
      .from("onboarding_progress")
      .select("completed_steps, skipped_steps")
      .eq("user_id", user.id)
      .maybeSingle();

    const completed_steps = Array.from(
      new Set([...(existing?.completed_steps || []), ...completed]),
    );
    const skipped_steps = Array.from(new Set([...(existing?.skipped_steps || []), ...skipped]));

    await supabase.from("onboarding_progress").upsert({
      user_id: user.id,
      current_step: nextStep,
      completed_steps,
      skipped_steps,
      is_complete: nextStep === "done",
      updated_at: new Date().toISOString(),
    });
  }

  async function continueFromStatus(skip = false) {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please log in first.");

      if (!skip) {
        await supabase.from("student_profiles").upsert({
          user_id: user.id,
          student_status: status,
          updated_at: new Date().toISOString(),
        });
      }

      await saveProgress("school", skip ? [] : ["status"], skip ? ["status"] : []);
      setStep("school");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save status.");
    } finally {
      setLoading(false);
    }
  }

  async function skipAllOnboarding() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please log in first.");

      await supabase.from("onboarding_progress").upsert({
        user_id: user.id,
        current_step: "done",
        completed_steps: [],
        skipped_steps: ["status", "school", "academic", "interests"],
        is_complete: true,
        updated_at: new Date().toISOString(),
      });
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not skip onboarding.");
    } finally {
      setLoading(false);
    }
  }

  async function continueFromSchool(skip = false) {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please log in first.");

      if (!skip) {
        if (!activeInstitution?.id || !activeCampusId) {
          throw new Error("Select your institution and campus.");
        }

        await supabase
          .from("campus_memberships")
          .update({ is_primary: false })
          .eq("user_id", user.id);

        const { error: membershipError } = await supabase.from("campus_memberships").upsert(
          {
            user_id: user.id,
            institution_id: activeInstitution.id,
            campus_id: activeCampusId,
            department: departmentName || null,
            program: programmeName || null,
            year_of_study: academicLevel || null,
            is_primary: true,
          },
          { onConflict: "user_id,campus_id" },
        );
        if (membershipError) throw new Error(membershipError.message || "Could not save school.");

        const { error: enrollmentError } = await supabase.from("student_enrollments").upsert(
          {
            user_id: user.id,
            institution_id: activeInstitution.id,
            campus_id: activeCampusId,
            is_primary: true,
            verification_status: "unverified",
          },
          { onConflict: "user_id,institution_id,campus_id" },
        );
        if (enrollmentError) throw new Error(enrollmentError.message || "Could not save enrollment.");

        if (missingSchool.trim()) {
          const { error: requestError } = await supabase.from("institution_requests").insert({
            user_id: user.id,
            proposed_name: missingSchool.trim(),
            institution_type: institutionType,
            notes: "Requested during CampusOS onboarding",
          });
          if (requestError) throw new Error(requestError.message || "Could not request school.");
        }
      }

      await saveProgress("academic", skip ? [] : ["school"], skip ? ["school"] : []);
      setStep("academic");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save school.");
    } finally {
      setLoading(false);
    }
  }

  async function continueFromAcademic(skip = false) {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please log in first.");

      if (!skip) {
        await supabase.from("student_profiles").upsert({
          user_id: user.id,
          student_status: status,
          programme_type: programmeType,
          academic_level: academicLevel,
          academic_session: academicSession || sessionOptions[0]?.label || null,
          current_semester: semester,
          study_mode: studyMode,
          faculty_name: facultyName || null,
          department_name: departmentName || null,
          programme_name: programmeName || null,
          grading_system: "5.0",
          updated_at: new Date().toISOString(),
        });

        if (activeInstitution?.id && activeCampusId) {
          await supabase
            .from("campus_memberships")
            .update({
              department: departmentName || null,
              program: programmeName || null,
              year_of_study: academicLevel || null,
            })
            .eq("user_id", user.id)
            .eq("campus_id", activeCampusId);
        }
      }

      await saveProgress("interests", skip ? [] : ["academic"], skip ? ["academic"] : []);
      setStep("interests");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save academic profile.");
    } finally {
      setLoading(false);
    }
  }

  async function finish(skipInterests = false) {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please log in first.");

      const selected = skipInterests ? [] : interests;
      await supabase.from("student_preferences").upsert({
        user_id: user.id,
        interests: selected,
        updated_at: new Date().toISOString(),
      });

      if (selected.includes("housing")) {
        await supabase.from("housing_preferences").upsert({
          user_id: user.id,
          housing_status: status === "fresher" ? "need_room" : "exploring",
          updated_at: new Date().toISOString(),
        });
      }

      await saveProgress("done", skipInterests ? [] : ["interests"], skipInterests ? ["interests"] : []);
      setStep("done");
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish onboarding.");
    } finally {
      setLoading(false);
    }
  }

  function toggleInterest(value: string) {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {ONBOARDING_STEPS.filter((s) => s !== "done").map((s, i) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-inverse-bg" : "bg-border"}`}
          />
        ))}
      </div>
      <p className="text-xs uppercase tracking-wide text-muted">
        Step {Math.min(stepIndex + 1, 4)} of 4
      </p>

      {step === "status" ? (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Which describes you best?</h2>
          <div className="space-y-2">
            {STUDENT_STATUSES.map((item) => (
              <label
                key={item.value}
                className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-sm ${
                  status === item.value ? "border-fg bg-surface" : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="student_status"
                  checked={status === item.value}
                  onChange={() => setStatus(item.value)}
                />
                {item.label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => continueFromStatus(false)} disabled={loading}>
              {loading ? "Saving…" : "Continue"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => continueFromStatus(true)} disabled={loading}>
              Skip for now
            </Button>
            <Button type="button" variant="secondary" onClick={skipAllOnboarding} disabled={loading}>
              Skip all
            </Button>
          </div>
          <p className="text-xs text-muted">Optional — finish later in Profile.</p>
        </div>
      ) : null}

      {step === "school" ? (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Select your school</h2>
          <p className="text-sm text-muted">
            Required for campus-scoped results.
            {status === "aspiring" ? " Skip if undecided." : ""}
          </p>
          <Field label="Institution type">
            <select
              className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
              value={institutionType}
              onChange={(e) => {
                const type = e.target.value;
                setInstitutionType(type);
                setInstitutionQuery("");
                const next = tertiaryInstitutions.find((i) => i.institution_type === type);
                setInstitutionId(next?.id || "");
                setCampusId(normalizeCampuses(next?.campuses)[0]?.id || "");
              }}
            >
              <option value="university">University</option>
              <option value="polytechnic">Polytechnic</option>
              <option value="college_of_education">College of Education</option>
              <option value="college">College / health school</option>
              <option value="monotechnic">Monotechnic</option>
              <option value="other">Other tertiary</option>
            </select>
          </Field>
          <Field label="Search school">
            <Input
              value={institutionQuery}
              onChange={(e) => {
                const q = e.target.value;
                setInstitutionQuery(q);
                const needle = q.trim().toLowerCase();
                if (!needle) return;
                const match = tertiaryInstitutions
                  .filter((i) => i.institution_type === institutionType)
                  .find((i) => {
                    const hay = `${i.name} ${i.short_name || ""}`.toLowerCase();
                    return (
                      (i.short_name || "").toLowerCase() === needle ||
                      hay.includes(needle)
                    );
                  });
                if (match) {
                  setInstitutionId(match.id);
                  setCampusId(normalizeCampuses(match.campuses)[0]?.id || "");
                }
              }}
              placeholder="Type name or short code (e.g. UNIOSUN, UNILAG)"
              autoComplete="off"
            />
          </Field>
          <Field label={`Institution (${filteredInstitutions.length} shown)`}>
            <select
              className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
              value={activeInstitution?.id || ""}
              onChange={(e) => {
                setInstitutionId(e.target.value);
                const inst = tertiaryInstitutions.find((i) => i.id === e.target.value);
                setCampusId(normalizeCampuses(inst?.campuses)[0]?.id || "");
              }}
            >
              {!filteredInstitutions.length ? (
                <option value="">No schools match — try another search or request below</option>
              ) : null}
              {filteredInstitutions.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                  {inst.short_name ? ` (${inst.short_name})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Campus">
            <select
              className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
              value={activeCampusId}
              onChange={(e) => setCampusId(e.target.value)}
              disabled={!campuses.length}
            >
              {!campuses.length ? <option value="">Select an institution first</option> : null}
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.city ? ` · ${c.city}` : ""}
                  {c.state ? `, ${c.state}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Can't find your school? Request it">
            <Input
              value={missingSchool}
              onChange={(e) => setMissingSchool(e.target.value)}
              placeholder="Official school name"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => continueFromSchool(false)} disabled={loading}>
              {loading ? "Saving…" : "Continue"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => continueFromSchool(true)} disabled={loading}>
              Skip for now
            </Button>
            <Button type="button" variant="secondary" onClick={skipAllOnboarding} disabled={loading}>
              Skip all
            </Button>
          </div>
        </div>
      ) : null}

      {step === "academic" ? (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Academic profile</h2>
          <p className="text-sm text-muted">Optional — edit later in Profile.</p>
          <Field label="Programme type">
            <select
              className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
              value={programmeType}
              onChange={(e) => {
                setProgrammeType(e.target.value);
                setAcademicLevel(levelsForProgrammeType(e.target.value)[0]);
              }}
            >
              <option value="undergraduate">University undergraduate</option>
              <option value="nd">National Diploma (ND)</option>
              <option value="hnd">Higher National Diploma (HND)</option>
              <option value="nce">NCE</option>
              <option value="postgraduate">Postgraduate</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Level">
            <select
              className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
              value={academicLevel}
              onChange={(e) => setAcademicLevel(e.target.value)}
            >
              {levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Faculty / college">
            <Input value={facultyName} onChange={(e) => setFacultyName(e.target.value)} placeholder="e.g. Faculty of Science" />
          </Field>
          <Field label="Department">
            {deptOptions.length ? (
              <select
                className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
                value={departmentName}
                onChange={(e) => setDepartmentName(e.target.value)}
              >
                <option value="">Select department</option>
                {deptOptions.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            ) : (
              <Input value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} placeholder="Department" />
            )}
          </Field>
          <Field label="Programme / course of study">
            <Input value={programmeName} onChange={(e) => setProgrammeName(e.target.value)} placeholder="e.g. B.Sc. Computer Science" />
          </Field>
          <Field label="Academic session">
            <select
              className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
              value={academicSession || sessionOptions[0]?.label || ""}
              onChange={(e) => setAcademicSession(e.target.value)}
            >
              {(sessionOptions.length ? sessionOptions : [{ id: "x", label: "2025/2026" }]).map((s) => (
                <option key={s.id} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Semester">
              <select
                className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
              >
                <option>First</option>
                <option>Second</option>
              </select>
            </Field>
            <Field label="Study mode">
              <select
                className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
                value={studyMode}
                onChange={(e) => setStudyMode(e.target.value)}
              >
                <option value="full-time">Full-time</option>
                <option value="part-time">Part-time</option>
                <option value="distance">Distance learning</option>
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => continueFromAcademic(false)} disabled={loading}>
              {loading ? "Saving…" : "Continue"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => continueFromAcademic(true)} disabled={loading}>
              Skip for now
            </Button>
            <Button type="button" variant="secondary" onClick={skipAllOnboarding} disabled={loading}>
              Skip all
            </Button>
          </div>
        </div>
      ) : null}

      {step === "interests" ? (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">What should CampusOS help with?</h2>
          <p className="text-sm text-muted">
            This only reorders your dashboard. Every feature stays available.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {INTEREST_OPTIONS.map((item) => {
              const selected = interests.includes(item.value);
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => toggleInterest(item.value)}
                  className={`rounded-md border px-4 py-3 text-left text-sm ${
                    selected ? "border-fg bg-surface" : "border-border"
                  }`}
                >
                  {item.label}
                  {selected ? <span className="mt-1 block text-xs text-muted">Selected</span> : null}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => finish(false)} disabled={loading}>
              {loading ? "Opening dashboard…" : "Enter CampusOS"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => finish(true)} disabled={loading}>
              Skip
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
