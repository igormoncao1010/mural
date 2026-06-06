create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text,
  neighborhood text default '',
  contact text default '',
  bio text default '',
  avatar_url text default '',
  role text default 'member',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists contact text default '';
alter table public.profiles add column if not exists role text default 'member';

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null,
  street text default '',
  neighborhood text default '',
  body text not null,
  image_url text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

create table if not exists public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  created_at timestamptz default now()
);

create table if not exists public.debates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text default '',
  status text default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_role in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' and coalesce(new.role, 'member') <> 'member' and not public.is_admin() then
    raise exception 'Only admins can create admin profiles';
  end if;

  if tg_op = 'UPDATE' and old.role is distinct from new.role and not public.is_admin() then
    raise exception 'Only admins can change profile roles';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
before insert or update on public.profiles
for each row execute function public.protect_profile_role();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.reports enable row level security;
alter table public.debates enable row level security;

drop policy if exists "profiles are visible to authenticated users" on public.profiles;
create policy "profiles are visible to authenticated users"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "users can insert their profile" on public.profiles;
create policy "users can insert their profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "users can update their profile" on public.profiles;
create policy "users can update their profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "admins can update profiles" on public.profiles;
create policy "admins can update profiles"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can delete profiles" on public.profiles;
create policy "admins can delete profiles"
on public.profiles for delete
to authenticated
using (public.is_admin() and auth.uid() <> id);

drop policy if exists "posts are visible to authenticated users" on public.posts;
create policy "posts are visible to authenticated users"
on public.posts for select
to authenticated
using (true);

drop policy if exists "users can create posts" on public.posts;
create policy "users can create posts"
on public.posts for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update their posts" on public.posts;
create policy "users can update their posts"
on public.posts for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can delete their posts" on public.posts;
create policy "users can delete their posts"
on public.posts for delete
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "comments are visible to authenticated users" on public.comments;
create policy "comments are visible to authenticated users"
on public.comments for select
to authenticated
using (true);

drop policy if exists "users can create comments" on public.comments;
create policy "users can create comments"
on public.comments for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can delete their comments" on public.comments;
create policy "users can delete their comments"
on public.comments for delete
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "likes are visible to authenticated users" on public.likes;
create policy "likes are visible to authenticated users"
on public.likes for select
to authenticated
using (true);

drop policy if exists "users can like posts" on public.likes;
create policy "users can like posts"
on public.likes for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can remove their likes" on public.likes;
create policy "users can remove their likes"
on public.likes for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can create reports" on public.reports;
create policy "users can create reports"
on public.reports for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "admins can view reports" on public.reports;
create policy "admins can view reports"
on public.reports for select
to authenticated
using (public.is_admin());

drop policy if exists "active debates are visible" on public.debates;
create policy "active debates are visible"
on public.debates for select
to authenticated
using (status = 'active' or public.is_admin());

drop policy if exists "admins can create debates" on public.debates;
create policy "admins can create debates"
on public.debates for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admins can update debates" on public.debates;
create policy "admins can update debates"
on public.debates for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can delete debates" on public.debates;
create policy "admins can delete debates"
on public.debates for delete
to authenticated
using (public.is_admin());

insert into public.debates (slug, title, description, status)
values
  ('infraestrutura', 'Infraestrutura', 'Ruas, calcadas, iluminacao e obras.', 'active'),
  ('saude', 'Saude', 'Atendimento, filas, unidades e prevencao.', 'active'),
  ('educacao', 'Educacao', 'Escolas, creches, transporte e aprendizagem.', 'active'),
  ('seguranca', 'Seguranca', 'Iluminacao, rondas e pontos de risco.', 'active'),
  ('mobilidade', 'Mobilidade', 'Transporte, acessibilidade e transito.', 'active')
on conflict (slug) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

drop policy if exists "authenticated users can upload avatars" on storage.objects;
create policy "authenticated users can upload avatars"
on storage.objects for insert
to authenticated
with check (bucket_id = 'avatars');

drop policy if exists "avatar images are public" on storage.objects;
create policy "avatar images are public"
on storage.objects for select
to public
using (bucket_id = 'avatars');

drop policy if exists "authenticated users can upload post images" on storage.objects;
create policy "authenticated users can upload post images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'post-images');

drop policy if exists "post images are public" on storage.objects;
create policy "post images are public"
on storage.objects for select
to public
using (bucket_id = 'post-images');

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts') then
    alter publication supabase_realtime add table public.posts;
  end if;

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments') then
    alter publication supabase_realtime add table public.comments;
  end if;

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'likes') then
    alter publication supabase_realtime add table public.likes;
  end if;

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports') then
    alter publication supabase_realtime add table public.reports;
  end if;

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'debates') then
    alter publication supabase_realtime add table public.debates;
  end if;

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
