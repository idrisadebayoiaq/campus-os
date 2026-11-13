-- Ensure authenticated clients can use student tables (RLS still applies).

grant select, insert, update, delete on public.campus_memberships to authenticated;
grant select, insert, update, delete on public.student_enrollments to authenticated;
grant select, insert, update, delete on public.onboarding_progress to authenticated;
grant select, insert, update, delete on public.institution_requests to authenticated;
grant select, insert, update, delete on public.student_profiles to authenticated;
grant select, insert, update, delete on public.student_preferences to authenticated;
grant select, insert, update, delete on public.housing_preferences to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.user_consents to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.conversation_participants to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.grade_entries to authenticated;
grant select, insert, update, delete on public.timetable_entries to authenticated;
grant select, insert, update, delete on public.student_courses to authenticated;
grant select, insert, update, delete on public.academic_tasks to authenticated;
grant select, insert, update, delete on public.exam_entries to authenticated;
grant select on public.departments, public.faculties, public.academic_sessions, public.programmes to authenticated, anon;
grant usage, select on all sequences in schema public to authenticated;
