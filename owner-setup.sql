-- Seif Messages: secure owner identity foundation
-- Run this file in Supabase SQL Editor for project qlcrvffejuscbftjotmp.
-- This does NOT yet add the owner dashboard or replace the legacy public-chat policies.
-- It only establishes a server-verified owner role tied to auth.uid().

begin;

create table if not exists public.seif_admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.seif_admin_roles enable row level security;

-- A signed-in user may read only their own role. No client may assign or change roles.
drop policy if exists "seif_admin_roles_read_own" on public.seif_admin_roles;
create policy "seif_admin_roles_read_own"
  on public.seif_admin_roles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.seif_admin_roles from anon, authenticated;
grant select on table public.seif_admin_roles to authenticated;

-- The function runs with its owner's privileges but derives identity only from
-- the verified Supabase JWT subject, never from a client-supplied user ID.
create or replace function public.is_seif_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seif_admin_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  );
$$;

revoke all on function public.is_seif_owner() from public, anon;
grant execute on function public.is_seif_owner() to authenticated;

-- Fail clearly rather than silently creating no owner record.
do $$
begin
  if not exists (
    select 1
    from auth.users
    where id = '4ce247c3-6439-40b4-8de7-0130895f3e01'::uuid
  ) then
    raise exception 'Owner UID was not found in auth.users. Check the UID before continuing.';
  end if;
end
$$;

-- Seed the confirmed owner account. Re-running this script preserves its owner role.
insert into public.seif_admin_roles (user_id, role)
values ('4ce247c3-6439-40b4-8de7-0130895f3e01'::uuid, 'owner')
on conflict (user_id) do update
set role = 'owner';

commit;

-- Verification (run after the script):
-- select public.is_seif_owner(); -- returns true only in a session authenticated as the owner
-- select user_id, role, created_at
-- from public.seif_admin_roles
-- where user_id = auth.uid();
