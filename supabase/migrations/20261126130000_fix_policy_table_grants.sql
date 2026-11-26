-- Tables that have RLS policies but were missing table-level GRANTs for the
-- authenticated role ("permission denied for table ..."). RLS still decides
-- which rows are visible; this only grants the privileges the policies expect.
do $$
declare
  r record;
begin
  for r in
    select distinct
      p.tablename as t,
      case when p.cmd = 'ALL' then x.priv else p.cmd end as priv
    from pg_policies p
    cross join lateral (
      select unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as priv
    ) x
    where p.schemaname = 'public'
      and (p.cmd = 'ALL' or x.priv = p.cmd)
      and exists (
        select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = p.tablename and c.relkind in ('r', 'p')
      )
  loop
    execute format('grant %s on public.%I to authenticated', r.priv, r.t);
  end loop;
end $$;

-- Public read policies explicitly targeting anon.
do $$
declare
  r record;
begin
  for r in
    select distinct tablename as t
    from pg_policies
    where schemaname = 'public'
      and cmd in ('SELECT', 'ALL')
      and 'anon' = any (roles)
  loop
    execute format('grant select on public.%I to anon', r.t);
  end loop;
end $$;
