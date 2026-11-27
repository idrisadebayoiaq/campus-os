-- Names for people you already chat with. Profiles stay private to everyone else.

create or replace function public.chat_people(p_ids uuid[])
returns table (id uuid, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
    coalesce(
      nullif(trim(p.preferred_name), ''),
      nullif(trim(p.first_name), ''),
      nullif(trim(p.full_name), ''),
      'Student'
    ),
    p.avatar_url
  from public.profiles p
  where p.id = any (coalesce(p_ids, '{}'))
    and (
      p.id = auth.uid()
      or exists (
        select 1
        from public.conversation_participants me
        join public.conversation_participants them on them.conversation_id = me.conversation_id
        where me.user_id = auth.uid() and them.user_id = p.id
      )
    );
$$;

revoke all on function public.chat_people(uuid[]) from public, anon;
grant execute on function public.chat_people(uuid[]) to authenticated;

-- "Chat" was saved when the other person's name could not be read.
update public.conversations set subject = null where kind = 'direct' and subject = 'Chat';
