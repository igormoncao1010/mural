create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text,
  neighborhood text default '',
  bio text default '',
  avatar_url text default '',
  role text default 'member',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'Morador'),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.reports enable row level security;

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
using (auth.uid() = user_id);

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
using (auth.uid() = user_id);

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
