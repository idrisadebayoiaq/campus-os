-- Support agents: their own role, separate from admin/moderator.
alter type public.app_role add value if not exists 'support';
