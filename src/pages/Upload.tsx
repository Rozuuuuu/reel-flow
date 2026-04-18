import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Upload as UploadIcon, X } from "lucide-react";

const captionSchema = z.string().trim().max(500);
const hashtagsSchema = z.string().trim().max(200);

const MAX_BYTES = 50 * 1024 * 1024; // 50MB

const generateThumbnail = (file: File): Promise<Blob | null> =>
  new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 1280;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        resolve(blob);
      }, "image/jpeg", 0.8);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
  });

export default function Upload() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [busy, setBusy] = useState(false);

  const onPick = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      toast.error("Please select a video file");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("Max file size is 50MB");
      return;
    }
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setCaption("");
    setHashtags("");
  };

  const handleUpload = async () => {
    if (!user || !file) return;
    const cap = captionSchema.safeParse(caption);
    const tags = hashtagsSchema.safeParse(hashtags);
    if (!cap.success) return toast.error("Caption too long");
    if (!tags.success) return toast.error("Hashtags too long");

    const tagList = tags.data
      .split(/[\s,#]+/)
      .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""))
      .filter(Boolean)
      .slice(0, 10);

    setBusy(true);
    try {
      const ts = Date.now();
      const ext = file.name.split(".").pop() || "mp4";
      const videoPath = `${user.id}/${ts}.${ext}`;

      const { error: vErr } = await supabase.storage
        .from("videos")
        .upload(videoPath, file, { contentType: file.type, upsert: false });
      if (vErr) throw vErr;
      const { data: vUrl } = supabase.storage.from("videos").getPublicUrl(videoPath);

      let thumbnailUrl: string | null = null;
      const thumb = await generateThumbnail(file);
      if (thumb) {
        const thumbPath = `${user.id}/${ts}.jpg`;
        const { error: tErr } = await supabase.storage
          .from("thumbnails")
          .upload(thumbPath, thumb, { contentType: "image/jpeg", upsert: false });
        if (!tErr) {
          thumbnailUrl = supabase.storage.from("thumbnails").getPublicUrl(thumbPath).data.publicUrl;
        }
      }

      const { error: insertErr } = await supabase.from("videos").insert({
        user_id: user.id,
        video_url: vUrl.publicUrl,
        thumbnail_url: thumbnailUrl,
        caption: cap.data || null,
        hashtags: tagList,
      });
      if (insertErr) throw insertErr;

      toast.success("Posted!");
      reset();
      navigate("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <h1 className="mb-6 text-2xl font-bold">New reel</h1>

      {!file ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          <div className="rounded-full bg-gradient-brand p-4 shadow-glow">
            <UploadIcon className="h-8 w-8 text-white" />
          </div>
          <div className="text-base font-medium text-foreground">Select a video</div>
          <div className="text-xs">MP4, MOV · up to 50MB</div>
        </button>
      ) : (
        <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-black">
          {previewUrl && (
            <video src={previewUrl} className="h-full w-full object-cover" autoPlay muted loop playsInline />
          )}
          <button
            type="button"
            onClick={reset}
            className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white backdrop-blur-sm"
            aria-label="Remove"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />

      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="caption">Caption</Label>
          <Textarea
            id="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Say something about your reel..."
            maxLength={500}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hashtags">Hashtags</Label>
          <Input
            id="hashtags"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="dance funny travel"
          />
          <p className="text-xs text-muted-foreground">Separate with spaces. Up to 10.</p>
        </div>

        <Button
          variant="brand"
          size="lg"
          className="w-full"
          disabled={!file || busy}
          onClick={handleUpload}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {busy ? "Uploading..." : "Post reel"}
        </Button>
      </div>
    </div>
  );
}
