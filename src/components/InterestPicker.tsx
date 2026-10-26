import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SUGGESTED_INTERESTS, MAX_INTERESTS } from "@/hooks/useInterests";
import { cn } from "@/lib/utils";

interface Props {
  initial: string[];
  saving: boolean;
  error?: string | null;
  onSave: (interests: string[]) => void;
  /** Shown when the viewer already has picks and is just tuning. */
  onCancel?: () => void;
}

export const InterestPicker = ({ initial, saving, error, onSave, onCancel }: Props) => {
  const [selected, setSelected] = useState<string[]>(initial);
  const [custom, setCustom] = useState("");

  const toggle = (topic: string) => {
    setSelected((cur) => {
      if (cur.includes(topic)) return cur.filter((t) => t !== topic);
      if (cur.length >= MAX_INTERESTS) return cur;
      return [...cur, topic];
    });
  };

  const addCustom = () => {
    const parts = custom
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setSelected((cur) => {
      const next = [...cur];
      for (const p of parts) {
        if (next.length >= MAX_INTERESTS) break;
        if (!next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p);
      }
      return next;
    });
    setCustom("");
  };

  const full = selected.length >= MAX_INTERESTS;

  return (
    <div className="relative flex h-full flex-col items-center justify-center px-6 py-10">
      <div className="grain pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-sm">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-sunset-orange">
          Reelo · Picks
        </p>
        <h2 className="font-display text-3xl italic leading-[1.05] text-foreground">
          What are you <span className="text-gradient-brand">into?</span>
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Pick a few topics and AI will rank reels from captions, hashtags and
          what you've liked or saved.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {SUGGESTED_INTERESTS.map((topic) => {
            const active = selected.includes(topic);
            return (
              <button
                key={topic}
                type="button"
                onClick={() => toggle(topic)}
                aria-pressed={active}
                disabled={!active && full}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "border-transparent bg-gradient-brand text-white shadow-glow"
                    : "border-border bg-card/60 text-foreground hover:bg-accent",
                  !active && full && "opacity-40",
                )}
              >
                {topic}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder={full ? "Enough topics for now" : "Add your own, comma separated"}
            disabled={full}
            className="rounded-full bg-card/60"
            maxLength={80}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addCustom}
            disabled={full || custom.trim() === ""}
            className="shrink-0 rounded-full"
          >
            Add
          </Button>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {selected.length}/{MAX_INTERESTS} selected
        </p>

        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button
          type="button"
          variant="brand"
          size="lg"
          className="mt-5 w-full rounded-full uppercase tracking-[0.18em] text-xs"
          onClick={() => onSave(selected)}
          disabled={saving || selected.length === 0}
        >
          {saving ? "Saving…" : selected.length === 0 ? "Pick at least one" : "Show my picks"}
        </Button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-3 mx-auto flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-3 w-3" /> Back to picks
          </button>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-sunset-orange" />
          AI-powered · updates as you watch
        </div>
      </div>
    </div>
  );
};
