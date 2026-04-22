import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyProfile, useMyVideos } from "@/hooks/useVideos";
import {
  useMyIncomingRequests,
  useRespondToFollowRequest,
} from "@/hooks/useFollowRequests";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Film, LogOut, Pencil, Loader2, Trash2, Inbox, Check, X } from "lucide-react";
import { z } from "zod";

const displayNameSchema = z.string().trim().min(1).max(50);
const bioSchema = z.string().trim().max(200);

export default function Profile() {
  const { user, signOut } = useAuth();
  const qc = useQueryClient();
  const { data: profile, isLoading } = useMyProfile(user?.id);
  const { data: videos } = useMyVideos(user?.id);
  const { data: incoming } = useMyIncomingRequests(user?.id);
  const respond = useRespondToFollowRequest(user?.id);

  const [editOpen, setEditOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const openEdit = () => {
    setDisplayName(profile?.display_name ?? profile?.username ?? "");
    setBio(profile?.bio ?? "");
    setAvatarFile(null);
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    const dn = displayNameSchema.safeParse(displayName);
    const b = bioSchema.safeParse(bio);
    if (!dn.success) return toast.error("Display name 1-50 chars");
    if (!b.success) return toast.error("Bio max 200 chars");

    setSaving(true);
    try {
      let avatar_url = profile?.avatar_url ?? null;

      if (avatarFile) {
        if (!avatarFile.type.startsWith("image/")) throw new Error("Avatar must be an image");
        if (avatarFile.size > 5 * 1024 * 1024) throw new Error("Avatar must be under 5MB");
        const ext = avatarFile.name.split(".").pop() || "jpg";
        const path = `${user.id}/avatar-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { contentType: avatarFile.type, upsert: true });
        if (upErr) throw upErr;
        avatar_url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ display_name: dn.data, bio: b.data || null, avatar_url })
        .eq("id", user.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["my-profile", user.id] });
      qc.invalidateQueries({ queryKey: ["feed-videos"] });
      toast.success("Profile updated");
      setEditOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (videoId: string, videoUrl: string) => {
    if (!user) return;
    if (!confirm("Delete this reel?")) return;
    try {
      // Best-effort storage cleanup
      const path = videoUrl.split("/videos/")[1];
      if (path) await supabase.storage.from("videos").remove([path]);
      const { error } = await supabase.from("videos").delete().eq("id", videoId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["my-videos", user.id] });
      qc.invalidateQueries({ queryKey: ["feed-videos"] });
      toast.success("Deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <header className="mb-6 flex flex-col items-center text-center">
        <Avatar className="h-24 w-24 border-2 border-border shadow-soft">
          <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="bg-gradient-brand text-2xl text-white">
            {(profile?.username ?? "U")[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <h1 className="mt-3 text-xl font-bold">{profile?.display_name ?? profile?.username}</h1>
        <p className="text-sm text-muted-foreground">@{profile?.username}</p>
        {profile?.bio && (
          <p className="mt-3 max-w-xs text-sm leading-snug">{profile.bio}</p>
        )}

        <div className="mt-5 flex gap-2">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" size="sm" onClick={openEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit profile
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit profile</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="avatar">Avatar</Label>
                  <Input
                    id="avatar"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display name</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={50}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={200}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="brand" onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Film className="h-4 w-4" /> Your reels ({videos?.length ?? 0})
      </h2>

      {(!videos || videos.length === 0) ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          You haven't posted any reels yet.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {videos.map((v) => (
            <div key={v.id} className="group relative aspect-[9/16] overflow-hidden rounded-md bg-muted">
              {v.thumbnail_url ? (
                <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <video src={v.video_url} className="h-full w-full object-cover" muted preload="metadata" />
              )}
              <button
                type="button"
                onClick={() => handleDelete(v.id, v.video_url)}
                aria-label="Delete reel"
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
