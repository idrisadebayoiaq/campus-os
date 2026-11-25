-- Fix "permission denied for table …" on study tools + marketplace browse.
-- RLS policies already existed; authenticated lacked table GRANTs.

grant select, insert, update, delete on table public.study_library_items to authenticated;
grant select, insert, update, delete on table public.flashcard_decks to authenticated;
grant select, insert, update, delete on table public.flashcards to authenticated;
grant select, insert, update, delete on table public.study_plan_blocks to authenticated;
grant select, insert, update, delete on table public.study_sessions to authenticated;
grant select, insert, update, delete on table public.study_groups to authenticated;
grant select, insert, update, delete on table public.cbt_attempts to authenticated;
grant select, insert, update, delete on table public.past_question_docs to authenticated;
grant select, insert, update, delete on table public.academic_calendar_events to authenticated;
grant select, insert, update, delete on table public.timetable_entries to authenticated;
grant select, insert, update, delete on table public.academic_tasks to authenticated;
grant select, insert, update, delete on table public.exam_entries to authenticated;
grant select, insert, update, delete on table public.grade_entries to authenticated;
grant select, insert, update, delete on table public.student_courses to authenticated;
grant select, insert, update, delete on table public.ai_companion_profiles to authenticated;

grant select on table public.marketplace_listings to authenticated;
grant select on table public.marketplace_listings to anon;
grant select on table public.business_profiles to authenticated;
grant select on table public.business_profiles to anon;

do $$
begin
  if to_regclass('public.study_tutors') is not null then
    execute 'grant select, insert, update, delete on table public.study_tutors to authenticated';
    alter table public.study_tutors enable row level security;
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'study_tutors'
        and policyname = 'Users manage own study_tutors'
    ) then
      execute $p$
        create policy "Users manage own study_tutors"
          on public.study_tutors for all to authenticated
          using (auth.uid() = user_id)
          with check (auth.uid() = user_id)
      $p$;
    end if;
  end if;
end $$;

drop policy if exists "marketplace_listings_public_read" on public.marketplace_listings;
create policy "marketplace_listings_public_read"
  on public.marketplace_listings for select to authenticated, anon
  using (status = 'active' or seller_user_id = auth.uid());

-- AI chat bootstrap: insert().select() needs creator SELECT before participant row exists
drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant"
  on public.conversations for select to authenticated
  using (
    is_conversation_participant(id)
    or created_by = auth.uid()
  );

drop policy if exists "conversations_update_participant" on public.conversations;
create policy "conversations_update_participant"
  on public.conversations for update to authenticated
  using (
    is_conversation_participant(id)
    or created_by = auth.uid()
  )
  with check (
    is_conversation_participant(id)
    or created_by = auth.uid()
  );
