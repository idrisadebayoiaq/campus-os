-- The server-side key (edge functions) needs ordinary table access. Supabase normally grants this by default,
-- but on this project service_role only had TRUNCATE/REFERENCES/TRIGGER, so payment functions could not read orders.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
