-- Wasel Social schema. Run in Supabase SQL Editor.
-- Safe to re-run; never expose service_role keys in browser code.
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default 'زائر',
 created_at timestamptz not null default now()
);
create table if not exists public.posts (
 id bigint generated always as identity primary key,
 author_id uuid not null references auth.users(id) on delete cascade,
 body text not null default '' check (char_length(body) <= 2000),
 image_path text,
 created_at timestamptz not null default now(),
 check (char_length(body) > 0 or image_path is not null)
);
create table if not exists public.messages (
 id bigint generated always as identity primary key,
 sender_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 body text not null default '' check (char_length(body) <= 5000),
 kind text not null default 'text' check (kind in ('text','image','audio','call-offer','call-answer','call-ice','call-end')),
 media_path text,
 created_at timestamptz not null default now(),
 check (sender_id <> recipient_id)
);
-- Migrate an existing starter database.
alter table public.messages add column if not exists media_path text;
alter table public.messages alter column body set default '';
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text','image','audio','call-offer','call-answer','call-ice','call-end'));
create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists messages_pair_created_idx on public.messages(sender_id,recipient_id,created_at);
create index if not exists messages_recipient_created_idx on public.messages(recipient_id,created_at desc);
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.messages enable row level security;
drop policy if exists "profiles readable by authenticated users" on public.profiles;
create policy "profiles readable by authenticated users" on public.profiles for select to authenticated using (true);
drop policy if exists "user inserts own profile" on public.profiles;
create policy "user inserts own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "user updates own profile" on public.profiles;
create policy "user updates own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles (id, display_name) values (new.id, 'زائر-' || substr(new.id::text,1,5)) on conflict (id) do nothing;
 return new;
end;
$$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute procedure public.create_profile_for_new_user();
drop policy if exists "authenticated users read posts" on public.posts;
create policy "authenticated users read posts" on public.posts for select to authenticated using (true);
drop policy if exists "users create own posts" on public.posts;
create policy "users create own posts" on public.posts for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "authors delete own posts" on public.posts;
create policy "authors delete own posts" on public.posts for delete to authenticated using (author_id = auth.uid());
drop policy if exists "participants read messages" on public.messages;
create policy "participants read messages" on public.messages for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists "sender creates message" on public.messages;
create policy "sender creates message" on public.messages for insert to authenticated with check (sender_id = auth.uid() and recipient_id <> auth.uid());
drop policy if exists "sender deletes own messages" on public.messages;
create policy "sender deletes own messages" on public.messages for delete to authenticated using (sender_id = auth.uid());
do $$
begin
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='posts') then alter publication supabase_realtime add table public.posts; end if;
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then alter publication supabase_realtime add table public.messages; end if;
end $$;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('post-images','post-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('chat-media','chat-media',false,20971520,array['image/jpeg','image/png','image/webp','image/gif','audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav'])
on conflict (id) do update set public=false,file_size_limit=20971520,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif','audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav'];
drop policy if exists "users upload images in own folder" on storage.objects;
create policy "users upload images in own folder" on storage.objects for insert to authenticated with check (bucket_id='post-images' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "authenticated users read post images" on storage.objects;
create policy "authenticated users read post images" on storage.objects for select to authenticated using (bucket_id='post-images');
drop policy if exists "users delete own images" on storage.objects;
create policy "users delete own images" on storage.objects for delete to authenticated using (bucket_id='post-images' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "chat participants upload own media" on storage.objects;
create policy "chat participants upload own media" on storage.objects for insert to authenticated with check (bucket_id='chat-media' and (storage.foldername(name))[1]=auth.uid()::text);
-- Chat media is private: only the uploader and the participants in the
-- message that references the file may read it. Do not grant bucket-wide reads.
drop policy if exists "authenticated users read chat media" on storage.objects;
create policy "chat participants read own media" on storage.objects
for select to authenticated
using (
 bucket_id='chat-media'
 and (
  (storage.foldername(name))[1]=auth.uid()::text
  or exists (
   select 1 from public.messages m
   where m.media_path = storage.objects.name
     and (m.sender_id=auth.uid() or m.recipient_id=auth.uid())
  )
 )
);
drop policy if exists "users delete own chat media" on storage.objects;
create policy "users delete own chat media" on storage.objects for delete to authenticated using (bucket_id='chat-media' and (storage.foldername(name))[1]=auth.uid()::text);

-- Explicit API grants for the tables used by the browser client.
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, delete on public.messages to authenticated;
grant select, insert, delete on public.posts to authenticated;
-- This is an MVP: restrict who can discover profiles before public launch and add abuse controls.


-- Wasel simple shared chat (no account login; shared public room).
-- Anyone who knows the public site can read/write this room. Do not send sensitive content.
create table if not exists public.wasel_chat_people (
  user_id text primary key,
  display_name text not null check (char_length(display_name) between 2 and 30),
  room_id text not null default 'wasel-friends',
  last_seen timestamptz not null default now()
);
create index if not exists wasel_chat_people_room_seen_idx
  on public.wasel_chat_people(room_id, last_seen desc);

create table if not exists public.wasel_chat_messages (
  id bigint generated by default as identity primary key,
  room_id text not null default 'wasel-friends',
  sender_id text not null,
  sender_name text not null,
  recipient_id text not null,
  body text not null default '' check (char_length(body) <= 2000),
  image_data text,
  created_at timestamptz not null default now(),
  check (char_length(body) > 0 or image_data is not null)
);
create index if not exists wasel_chat_messages_room_created_idx
  on public.wasel_chat_messages(room_id, created_at asc);

alter table public.wasel_chat_people enable row level security;
alter table public.wasel_chat_messages enable row level security;
drop policy if exists "Wasel public people read" on public.wasel_chat_people;
create policy "Wasel public people read" on public.wasel_chat_people
  for select to anon using (room_id = 'wasel-friends');
drop policy if exists "Wasel public people insert" on public.wasel_chat_people;
create policy "Wasel public people insert" on public.wasel_chat_people
  for insert to anon with check (room_id = 'wasel-friends');
drop policy if exists "Wasel public people update" on public.wasel_chat_people;
create policy "Wasel public people update" on public.wasel_chat_people
  for update to anon using (room_id = 'wasel-friends') with check (room_id = 'wasel-friends');

drop policy if exists "Wasel public messages read" on public.wasel_chat_messages;
create policy "Wasel public messages read" on public.wasel_chat_messages
  for select to anon using (room_id = 'wasel-friends');
drop policy if exists "Wasel public messages insert" on public.wasel_chat_messages;
create policy "Wasel public messages insert" on public.wasel_chat_messages
  for insert to anon with check (room_id = 'wasel-friends');

grant usage on schema public to anon;
grant select, insert, update on public.wasel_chat_people to anon;
grant select, insert on public.wasel_chat_messages to anon;
grant usage, select on sequence public.wasel_chat_messages_id_seq to anon;


-- Seif Messages feature migration (safe to re-run).
alter table public.wasel_chat_people add column if not exists avatar_data text;
alter table public.wasel_chat_people add column if not exists is_typing boolean not null default false;
alter table public.wasel_chat_people add column if not exists typing_to text;
alter table public.wasel_chat_messages add column if not exists read_at timestamptz;
alter table public.wasel_chat_messages add column if not exists delivered_at timestamptz;
alter table public.wasel_chat_messages add column if not exists reply_to bigint;
alter table public.wasel_chat_messages add column if not exists reactions jsonb not null default '{}'::jsonb;
alter table public.wasel_chat_messages add column if not exists deleted_at timestamptz;
create index if not exists wasel_chat_messages_unread_idx on public.wasel_chat_messages(recipient_id, read_at) where read_at is null and deleted_at is null;
create index if not exists wasel_chat_messages_reply_idx on public.wasel_chat_messages(reply_to);
-- This is deliberately a personal-use, public-room MVP: anyone using the public anon key
-- can update rows in this room. Do not use it for private or sensitive conversations.
drop policy if exists "Wasel public messages update" on public.wasel_chat_messages;
create policy "Wasel public messages update" on public.wasel_chat_messages
  for update to anon using (room_id = 'wasel-friends') with check (room_id = 'wasel-friends');
grant select, insert, update on public.wasel_chat_messages to anon;
grant select, insert, update on public.wasel_chat_people to anon;


-- One-time-view image support (client-enforced MVP; not DRM or end-to-end encryption).
alter table public.wasel_chat_messages add column if not exists view_once boolean not null default false;
alter table public.wasel_chat_messages add column if not exists viewed_at timestamptz;
create index if not exists wasel_chat_messages_view_once_idx on public.wasel_chat_messages(id) where view_once = true;

-- Compatibility migration for current Seif Messages client (safe to re-run).
alter table public.wasel_chat_messages add column if not exists audio_data text;
alter table public.wasel_chat_messages drop constraint if exists wasel_chat_messages_check;
alter table public.wasel_chat_messages drop constraint if exists wasel_chat_messages_content_check;
alter table public.wasel_chat_messages add constraint wasel_chat_messages_content_check check (char_length(body) > 0 or image_data is not null or audio_data is not null);

alter table public.wasel_chat_messages add column if not exists view_once boolean not null default false;
alter table public.wasel_chat_messages add column if not exists viewed_at timestamptz;
alter table public.wasel_chat_messages add column if not exists read_at timestamptz;
alter table public.wasel_chat_messages add column if not exists delivered_at timestamptz;
alter table public.wasel_chat_messages add column if not exists reply_to bigint;
alter table public.wasel_chat_messages add column if not exists reactions jsonb not null default '{}'::jsonb;
alter table public.wasel_chat_messages add column if not exists deleted_at timestamptz;
alter table public.wasel_chat_people add column if not exists avatar_data text;
alter table public.wasel_chat_people add column if not exists is_typing boolean not null default false;
alter table public.wasel_chat_people add column if not exists typing_to text;
create index if not exists wasel_chat_messages_view_once_idx on public.wasel_chat_messages(id) where view_once = true;
notify pgrst, 'reload schema';
