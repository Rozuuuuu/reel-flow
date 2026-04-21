import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search as SearchIcon, Loader2, Hash, Play } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FollowButton } from "@/components/FollowButton";
import {
  useDebounce,
  useSearchHashtags,
  useSearchUsers,
  useSearchVideos,
} from "@/hooks/useSearch";

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const initialTab = searchParams.get("tab") ?? "users";
  const [query, setQuery] = useState(initialQ);
  const [tab, setTab] = useState(initialTab);
  const debounced = useDebounce(query, 300);

  // Sync external param changes (e.g. tapping a hashtag elsewhere) into state
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    const t = searchParams.get("tab") ?? "users";
    setQuery(q);
    setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  // Reflect current query/tab into the URL (shallow, no history spam)
  useEffect(() => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (tab && tab !== "users") next.set("tab", tab);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tab]);

  const users = useSearchUsers(debounced);
  const videos = useSearchVideos(debounced);
  const hashtags = useSearchHashtags(debounced);

  const isEmpty = debounced.trim().length === 0;

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <h1 className="sr-only">Search</h1>
      <div className="relative mb-4">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search users, hashtags, captions…"
          className="pl-9"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="hashtags">Hashtags</TabsTrigger>
          <TabsTrigger value="videos">Videos</TabsTrigger>
        </TabsList>

        {/* Users */}
        <TabsContent value="users" className="mt-4 space-y-2">
          {isEmpty ? (
            <EmptyHint label="Search for people by username" />
          ) : users.isLoading ? (
            <Spinner />
          ) : (users.data ?? []).length === 0 ? (
            <EmptyHint label="No users found" />
          ) : (
            users.data!.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <Avatar className="h-12 w-12">
                  <AvatarImage src={u.avatar_url ?? undefined} alt="" />
                  <AvatarFallback className="bg-gradient-brand text-white">
                    {u.username[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">@{u.username}</div>
                  {u.display_name && (
                    <div className="truncate text-sm text-muted-foreground">
                      {u.display_name}
                    </div>
                  )}
                </div>
                <FollowButton targetUserId={u.id} />
              </div>
            ))
          )}
        </TabsContent>

        {/* Hashtags */}
        <TabsContent value="hashtags" className="mt-4 space-y-2">
          {isEmpty ? (
            <EmptyHint label="Search for hashtags" />
          ) : hashtags.isLoading ? (
            <Spinner />
          ) : (hashtags.data ?? []).length === 0 ? (
            <EmptyHint label="No hashtags found" />
          ) : (
            hashtags.data!.map((h) => (
              <button
                key={h.tag}
                type="button"
                onClick={() => {
                  setQuery(`#${h.tag}`);
                  setTab("videos");
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition hover:bg-accent"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-brand">
                  <Hash className="h-6 w-6 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">#{h.tag}</div>
                  <div className="text-sm text-muted-foreground">
                    {h.count} {h.count === 1 ? "video" : "videos"}
                  </div>
                </div>
              </button>
            ))
          )}
        </TabsContent>

        {/* Videos */}
        <TabsContent value="videos" className="mt-4">
          {isEmpty ? (
            <EmptyHint label="Search captions" />
          ) : videos.isLoading ? (
            <Spinner />
          ) : (videos.data ?? []).length === 0 ? (
            <EmptyHint label="No videos found" />
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {videos.data!.map((v) => (
                <Link
                  key={v.id}
                  to="/"
                  className="group relative aspect-[9/16] overflow-hidden rounded-md bg-muted"
                >
                  {v.thumbnail_url ? (
                    <img
                      src={v.thumbnail_url}
                      alt={v.caption ?? "video"}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Play className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                    <p className="truncate text-[10px] font-medium text-white">
                      @{v.profile?.username ?? "unknown"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

const Spinner = () => (
  <div className="flex justify-center py-10">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

const EmptyHint = ({ label }: { label: string }) => (
  <p className="py-10 text-center text-sm text-muted-foreground">{label}</p>
);
