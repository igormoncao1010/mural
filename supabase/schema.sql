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
  badge_title text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists contact text default '';
alter table public.profiles add column if not exists role text default 'member';
alter table public.profiles add column if not exists badge_title text default '';

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null,
  category text default 'problema',
  issue_status text default 'aberto',
  street text default '',
  neighborhood text default '',
  body text not null,
  image_url text default '',
  admin_response text default '',
  status_updated_by uuid references public.profiles(id) on delete set null,
  status_updated_at timestamptz,
  share_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.posts add column if not exists share_count integer default 0;
alter table public.posts add column if not exists category text default 'problema';
alter table public.posts add column if not exists issue_status text default 'aberto';
alter table public.posts add column if not exists admin_response text default '';
alter table public.posts add column if not exists status_updated_by uuid references public.profiles(id) on delete set null;
alter table public.posts add column if not exists status_updated_at timestamptz;

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

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('like', 'comment', 'status', 'admin_response')),
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz default now()
);

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in ('like', 'comment', 'status', 'admin_response'));

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

create table if not exists public.candidate_pages (
  slug text primary key,
  name text not null,
  email text not null,
  role text default '',
  bio text default '',
  image_url text default '',
  profile_image_url text default '',
  story_image_url text default '',
  cover_image_url text default '',
  text_color text default '#ffffff',
  background_color text default '#111111',
  accent_color text default '#111111',
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.candidate_pages add column if not exists profile_image_url text default '';
alter table public.candidate_pages add column if not exists story_image_url text default '';
alter table public.candidate_pages add column if not exists cover_image_url text default '';
alter table public.candidate_pages add column if not exists text_color text default '#ffffff';
alter table public.candidate_pages add column if not exists background_color text default '#111111';
alter table public.candidate_pages add column if not exists accent_color text default '#111111';

create table if not exists public.candidate_questions (
  id uuid primary key default gen_random_uuid(),
  candidate_slug text not null references public.candidate_pages(slug) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null,
  question text not null,
  answer text default '',
  answered_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.airdrops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  caption text default '',
  image_url text not null,
  font_family text default 'Inter, system-ui, sans-serif',
  text_color text default '#ffffff',
  background_color text default '#111111',
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create table if not exists public.airdrop_views (
  airdrop_id uuid not null references public.airdrops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz default now(),
  primary key (airdrop_id, user_id)
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

create or replace function public.increment_post_share(post_id_input uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.posts
  set share_count = coalesce(share_count, 0) + 1
  where id = post_id_input;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
before insert or update on public.profiles
for each row execute function public.protect_profile_role();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.debates enable row level security;
alter table public.candidate_pages enable row level security;
alter table public.candidate_questions enable row level security;
alter table public.airdrops enable row level security;
alter table public.airdrop_views enable row level security;

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

drop policy if exists "admins can moderate posts" on public.posts;
create policy "admins can moderate posts"
on public.posts for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

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

drop policy if exists "follows are visible to authenticated users" on public.follows;
create policy "follows are visible to authenticated users"
on public.follows for select
to authenticated
using (true);

drop policy if exists "users can follow profiles" on public.follows;
create policy "users can follow profiles"
on public.follows for insert
to authenticated
with check (auth.uid() = follower_id);

drop policy if exists "users can unfollow profiles" on public.follows;
create policy "users can unfollow profiles"
on public.follows for delete
to authenticated
using (auth.uid() = follower_id);

drop policy if exists "users can view their notifications" on public.notifications;
create policy "users can view their notifications"
on public.notifications for select
to authenticated
using (auth.uid() = recipient_id);

drop policy if exists "users can create notifications" on public.notifications;
create policy "users can create notifications"
on public.notifications for insert
to authenticated
with check (auth.uid() = actor_id and auth.uid() <> recipient_id);

drop policy if exists "users can mark their notifications as read" on public.notifications;
create policy "users can mark their notifications as read"
on public.notifications for update
to authenticated
using (auth.uid() = recipient_id)
with check (auth.uid() = recipient_id);

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

drop policy if exists "active candidate pages are visible" on public.candidate_pages;
create policy "active candidate pages are visible"
on public.candidate_pages for select
to authenticated
using (status = 'active' or public.is_admin());

drop policy if exists "admins can manage candidate pages" on public.candidate_pages;
create policy "admins can manage candidate pages"
on public.candidate_pages for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "candidates can update their candidate page media" on public.candidate_pages;
create policy "candidates can update their candidate page media"
on public.candidate_pages for update
to authenticated
using (lower(email) = lower(auth.jwt() ->> 'email'))
with check (lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "candidate questions are visible" on public.candidate_questions;
create policy "candidate questions are visible"
on public.candidate_questions for select
to authenticated
using (true);

drop policy if exists "users can ask candidate questions" on public.candidate_questions;
create policy "users can ask candidate questions"
on public.candidate_questions for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "candidates can answer their questions" on public.candidate_questions;
create policy "candidates can answer their questions"
on public.candidate_questions for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.candidate_pages candidate
    where candidate.slug = public.candidate_questions.candidate_slug
      and lower(candidate.email) = lower(auth.jwt() ->> 'email')
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.candidate_pages candidate
    where candidate.slug = public.candidate_questions.candidate_slug
      and lower(candidate.email) = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "users and admins can delete candidate questions" on public.candidate_questions;
create policy "users and admins can delete candidate questions"
on public.candidate_questions for delete
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "active airdrops are visible" on public.airdrops;
create policy "active airdrops are visible"
on public.airdrops for select
to authenticated
using (expires_at > now() or auth.uid() = user_id or public.is_admin());

drop policy if exists "users can create airdrops" on public.airdrops;
create policy "users can create airdrops"
on public.airdrops for insert
to authenticated
with check (auth.uid() = user_id and expires_at <= now() + interval '24 hours 5 minutes');

drop policy if exists "users can delete their airdrops" on public.airdrops;
create policy "users can delete their airdrops"
on public.airdrops for delete
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "users can view their airdrop views" on public.airdrop_views;
create policy "users can view their airdrop views"
on public.airdrop_views for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can register airdrop views" on public.airdrop_views;
create policy "users can register airdrop views"
on public.airdrop_views for insert
to authenticated
with check (auth.uid() = user_id);

insert into public.debates (slug, title, description, status)
values
  ('infraestrutura', 'Infraestrutura', 'Ruas, calçadas, iluminação e obras.', 'active'),
  ('saude', 'Saúde', 'Atendimento, filas, unidades e prevenção.', 'active'),
  ('educacao', 'Educação', 'Escolas, creches, transporte e aprendizagem.', 'active'),
  ('seguranca', 'Segurança', 'Iluminação, rondas e pontos de risco.', 'active'),
  ('mobilidade', 'Mobilidade', 'Transporte, acessibilidade e trânsito.', 'active')
on conflict (slug) do update
set title = excluded.title,
    description = excluded.description,
    status = excluded.status;

insert into public.candidate_pages (slug, name, email, role, bio, image_url, story_image_url, cover_image_url, text_color, background_color, accent_color, status)
values
  (
    'ana-martins',
    'Ronaldo Caiado',
    'caiado@nodus.com.br',
    'Pré-candidato',
    'Espaço público para perguntas, respostas e propostas de Ronaldo Caiado.',
    'https://veja.abril.com.br/wp-content/uploads/2025/10/RONALDO-CAIADO-53750771138.jpg.jpg?crop=1&h=720&quality=70&strip=info&w=1280',
    'https://veja.abril.com.br/wp-content/uploads/2025/10/RONALDO-CAIADO-53750771138.jpg.jpg?crop=1&h=720&quality=70&strip=info&w=1280',
    'https://veja.abril.com.br/wp-content/uploads/2025/10/RONALDO-CAIADO-53750771138.jpg.jpg?crop=1&h=720&quality=70&strip=info&w=1280',
    '#ffffff',
    '#111111',
    '#0f766e',
    'active'
  ),
  (
    'carlos-rocha',
    'Arruda',
    'arruda@nodus.com.br',
    'Pré-candidato',
    'Espaço público para perguntas, respostas e propostas de Arruda.',
    'https://conteudo.imguol.com.br/c/noticias/e8/2022/05/21/jose-roberto-arruda-1653160908081_v2_3x4.jpg',
    'https://conteudo.imguol.com.br/c/noticias/e8/2022/05/21/jose-roberto-arruda-1653160908081_v2_3x4.jpg',
    'https://conteudo.imguol.com.br/c/noticias/e8/2022/05/21/jose-roberto-arruda-1653160908081_v2_3x4.jpg',
    '#ffffff',
    '#111111',
    '#2563eb',
    'active'
  ),
  (
    'marina-alves',
    'Marina Alves',
    'marinaalves@nodus.com.br',
    'Saúde',
    'Debate público sobre atendimento, filas e prevenção.',
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=420&q=80',
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=1200&q=85',
    '#ffffff',
    '#111111',
    '#dc2626',
    'active'
  ),
  (
    'rafael-lima',
    'Rafael Lima',
    'rafaellima@nodus.com.br',
    'Mobilidade',
    'Transporte, acessibilidade, trânsito e deslocamento.',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=420&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1200&q=85',
    '#ffffff',
    '#111111',
    '#7c3aed',
    'active'
  ),
  (
    'bianca-torres',
    'Bianca Torres',
    'biancatorres@nodus.com.br',
    'Segurança',
    'Iluminação, rondas, prevenção e pontos de risco.',
    'https://images.unsplash.com/photo-1598550874175-4d0ef436c909?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1598550874175-4d0ef436c909?auto=format&fit=crop&w=420&q=80',
    'https://images.unsplash.com/photo-1598550874175-4d0ef436c909?auto=format&fit=crop&w=1200&q=85',
    '#ffffff',
    '#111111',
    '#f97316',
    'active'
  ),
  (
    'henrique-nunes',
    'Henrique Nunes',
    'henriquenunes@nodus.com.br',
    'Juventude',
    'Projetos para juventude, esporte e oportunidade.',
    'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=420&q=80',
    'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=1200&q=85',
    '#ffffff',
    '#111111',
    '#0891b2',
    'active'
  ),
  (
    'paula-ribeiro',
    'Paula Ribeiro',
    'paularibeiro@nodus.com.br',
    'Cultura',
    'Cultura, periferia, economia criativa e participação.',
    'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=420&q=80',
    'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=85',
    '#ffffff',
    '#111111',
    '#db2777',
    'active'
  ),
  (
    'leandro-costa',
    'Leandro Costa',
    'leandrocosta@nodus.com.br',
    'Trabalho',
    'Emprego, renda, formação e empreendedorismo local.',
    'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?auto=format&fit=crop&w=420&q=80',
    'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?auto=format&fit=crop&w=1200&q=85',
    '#ffffff',
    '#111111',
    '#ca8a04',
    'active'
  ),
  (
    'sofia-campos',
    'Sofia Campos',
    'sofiacampos@nodus.com.br',
    'Meio ambiente',
    'Sustentabilidade, parques, lixo e cuidado urbano.',
    'https://images.unsplash.com/photo-1607746882042-944635dfe10e?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1607746882042-944635dfe10e?auto=format&fit=crop&w=420&q=80',
    'https://images.unsplash.com/photo-1607746882042-944635dfe10e?auto=format&fit=crop&w=1200&q=85',
    '#ffffff',
    '#111111',
    '#16a34a',
    'active'
  ),
  (
    'diego-freitas',
    'Diego Freitas',
    'diegofreitas@nodus.com.br',
    'Comunidade',
    'Demandas locais, liderança comunitária e prioridades.',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=420&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1200&q=85',
    '#ffffff',
    '#111111',
    '#525252',
    'active'
  )
on conflict (slug) do update
set name = coalesce(nullif(public.candidate_pages.name, ''), excluded.name),
    email = coalesce(nullif(public.candidate_pages.email, ''), excluded.email),
    role = coalesce(nullif(public.candidate_pages.role, ''), excluded.role),
    bio = coalesce(nullif(public.candidate_pages.bio, ''), excluded.bio),
    image_url = coalesce(nullif(public.candidate_pages.image_url, ''), excluded.image_url),
    story_image_url = coalesce(nullif(public.candidate_pages.story_image_url, ''), excluded.story_image_url),
    cover_image_url = coalesce(nullif(public.candidate_pages.cover_image_url, ''), excluded.cover_image_url),
    text_color = coalesce(nullif(public.candidate_pages.text_color, ''), excluded.text_color),
    background_color = coalesce(nullif(public.candidate_pages.background_color, ''), excluded.background_color),
    accent_color = coalesce(nullif(public.candidate_pages.accent_color, ''), excluded.accent_color),
    status = coalesce(nullif(public.candidate_pages.status, ''), excluded.status);

update public.candidate_pages
set name = 'Ronaldo Caiado',
    email = 'caiado@nodus.com.br',
    role = 'Pré-candidato',
    bio = 'Espaço público para perguntas, respostas e propostas de Ronaldo Caiado.',
    image_url = 'https://veja.abril.com.br/wp-content/uploads/2025/10/RONALDO-CAIADO-53750771138.jpg.jpg?crop=1&h=720&quality=70&strip=info&w=1280',
    story_image_url = 'https://veja.abril.com.br/wp-content/uploads/2025/10/RONALDO-CAIADO-53750771138.jpg.jpg?crop=1&h=720&quality=70&strip=info&w=1280',
    cover_image_url = 'https://veja.abril.com.br/wp-content/uploads/2025/10/RONALDO-CAIADO-53750771138.jpg.jpg?crop=1&h=720&quality=70&strip=info&w=1280',
    accent_color = '#0f766e'
where slug = 'ana-martins';

update public.candidate_pages
set name = 'Arruda',
    email = 'arruda@nodus.com.br',
    role = 'Pré-candidato',
    bio = 'Espaço público para perguntas, respostas e propostas de Arruda.',
    image_url = 'https://conteudo.imguol.com.br/c/noticias/e8/2022/05/21/jose-roberto-arruda-1653160908081_v2_3x4.jpg',
    story_image_url = 'https://conteudo.imguol.com.br/c/noticias/e8/2022/05/21/jose-roberto-arruda-1653160908081_v2_3x4.jpg',
    cover_image_url = 'https://conteudo.imguol.com.br/c/noticias/e8/2022/05/21/jose-roberto-arruda-1653160908081_v2_3x4.jpg',
    accent_color = '#2563eb'
where slug = 'carlos-rocha';

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('candidate-images', 'candidate-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('airdrop-images', 'airdrop-images', true)
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

drop policy if exists "authenticated users can upload candidate images" on storage.objects;
create policy "authenticated users can upload candidate images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'candidate-images');

drop policy if exists "candidate images are public" on storage.objects;
create policy "candidate images are public"
on storage.objects for select
to public
using (bucket_id = 'candidate-images');

drop policy if exists "authenticated users can upload airdrop images" on storage.objects;
create policy "authenticated users can upload airdrop images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'airdrop-images');

drop policy if exists "airdrop images are public" on storage.objects;
create policy "airdrop images are public"
on storage.objects for select
to public
using (bucket_id = 'airdrop-images');

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

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'follows') then
    alter publication supabase_realtime add table public.follows;
  end if;

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
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

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'candidate_questions') then
    alter publication supabase_realtime add table public.candidate_questions;
  end if;

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'candidate_pages') then
    alter publication supabase_realtime add table public.candidate_pages;
  end if;

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'airdrops') then
    alter publication supabase_realtime add table public.airdrops;
  end if;

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'airdrop_views') then
    alter publication supabase_realtime add table public.airdrop_views;
  end if;
end $$;
