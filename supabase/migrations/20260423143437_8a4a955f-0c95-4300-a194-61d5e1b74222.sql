-- 1. Roles infrastructure
do $$ begin
  create type public.app_role as enum ('admin', 'moderator', 'user');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_moderator(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('admin', 'moderator')
  )
$$;

drop policy if exists "Roles are viewable by everyone" on public.user_roles;
create policy "Roles are viewable by everyone"
  on public.user_roles for select using (true);

drop policy if exists "Only admins can manage roles" on public.user_roles;
create policy "Only admins can manage roles"
  on public.user_roles for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 2. Comments: replies + moderation hide
alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade,
  add column if not exists hidden_at timestamptz;

create index if not exists comments_parent_id_idx on public.comments (parent_id, created_at);

-- 3. Replace comment SELECT policy so hidden ones aren't shown to the public
drop policy if exists "Comments are viewable by everyone" on public.comments;

create policy "Visible comments are viewable by everyone"
  on public.comments for select
  using (
    hidden_at is null
    or auth.uid() = user_id
    or public.is_moderator(auth.uid())
  );

-- 4. Allow moderators to update/delete any comment (in addition to existing owner policies)
drop policy if exists "Moderators can update any comment" on public.comments;
create policy "Moderators can update any comment"
  on public.comments for update
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

drop policy if exists "Moderators can delete any comment" on public.comments;
create policy "Moderators can delete any comment"
  on public.comments for delete
  using (public.is_moderator(auth.uid()));

-- 5. Reports
do $$ begin
  create type public.report_status as enum ('pending', 'reviewed', 'dismissed');
exception when duplicate_object then null; end $$;

create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  reporter_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 500),
  status public.report_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  unique (comment_id, reporter_id)
);

create index if not exists comment_reports_status_idx
  on public.comment_reports (status, created_at desc);

alter table public.comment_reports enable row level security;

drop policy if exists "Reporters can view their own reports" on public.comment_reports;
create policy "Reporters can view their own reports"
  on public.comment_reports for select
  using (auth.uid() = reporter_id or public.is_moderator(auth.uid()));

drop policy if exists "Authenticated users can create reports" on public.comment_reports;
create policy "Authenticated users can create reports"
  on public.comment_reports for insert
  with check (auth.uid() = reporter_id);

drop policy if exists "Moderators can update reports" on public.comment_reports;
create policy "Moderators can update reports"
  on public.comment_reports for update
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

drop policy if exists "Moderators can delete reports" on public.comment_reports;
create policy "Moderators can delete reports"
  on public.comment_reports for delete
  using (public.is_moderator(auth.uid()));