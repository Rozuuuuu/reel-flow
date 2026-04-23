-- 1. Comment edit history
create table if not exists public.comment_edits (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  editor_id uuid not null,
  previous_body text not null,
  edited_at timestamptz not null default now()
);

create index if not exists comment_edits_comment_idx
  on public.comment_edits (comment_id, edited_at desc);

alter table public.comment_edits enable row level security;

drop policy if exists "Edit history viewable by everyone" on public.comment_edits;
create policy "Edit history viewable by everyone"
  on public.comment_edits for select using (true);

drop policy if exists "Comment owners can record their own edits" on public.comment_edits;
create policy "Comment owners can record their own edits"
  on public.comment_edits for insert
  with check (
    auth.uid() = editor_id
    and exists (
      select 1 from public.comments c
      where c.id = comment_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Moderators can record edits" on public.comment_edits;
create policy "Moderators can record edits"
  on public.comment_edits for insert
  with check (public.is_moderator(auth.uid()) and auth.uid() = editor_id);

-- 2. Notifications (in-app)
do $$ begin
  create type public.notification_type as enum ('comment_reply', 'follow_request', 'follow_accepted');
exception when duplicate_object then null; end $$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  actor_id uuid,
  type public.notification_type not null,
  comment_id uuid references public.comments(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications"
  on public.notifications for select using (auth.uid() = user_id);

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
  on public.notifications for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own notifications" on public.notifications;
create policy "Users can delete their own notifications"
  on public.notifications for delete using (auth.uid() = user_id);

-- 3. Web push subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can view their own push subs" on public.push_subscriptions;
create policy "Users can view their own push subs"
  on public.push_subscriptions for select using (auth.uid() = user_id);

drop policy if exists "Users can create their own push subs" on public.push_subscriptions;
create policy "Users can create their own push subs"
  on public.push_subscriptions for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own push subs" on public.push_subscriptions;
create policy "Users can delete their own push subs"
  on public.push_subscriptions for delete using (auth.uid() = user_id);

-- 4. Trigger: when a reply is created, notify the parent author (if not self)
create or replace function public.handle_comment_reply_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_author uuid;
  parent_video uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select user_id, video_id into parent_author, parent_video
  from public.comments where id = new.parent_id;

  if parent_author is null or parent_author = new.user_id then
    return new;
  end if;

  insert into public.notifications (user_id, actor_id, type, comment_id, video_id, data)
  values (
    parent_author,
    new.user_id,
    'comment_reply',
    new.id,
    parent_video,
    jsonb_build_object('parent_id', new.parent_id, 'preview', left(new.body, 140))
  );

  return new;
end;
$$;

drop trigger if exists comments_reply_notify on public.comments;
create trigger comments_reply_notify
  after insert on public.comments
  for each row execute function public.handle_comment_reply_notification();

-- 5. Realtime for notifications
alter publication supabase_realtime add table public.notifications;