import { useCallback, useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export const SUGGESTED_INTERESTS = [
  "Comedy", "Cooking", "Travel", "Music", "Fitness", "Gaming",
  "Fashion", "Pets", "Art", "Tech", "Cars", "Nature",
  "Dance", "Food", "Sports", "DIY",
] as const;

export const MAX_INTERESTS = 8;

const GUEST_KEY = "reelo:guest-interests";

const readGuestInterests = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
};

const writeGuestInterests = (interests: string[]) => {
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(interests));
  } catch {
    /* quota or privacy mode — ignore */
  }
};

/** Viewer interests: cloud-backed for signed-in users, localStorage for guests. */
export const useInterests = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["interests", user?.id ?? "guest"],
    queryFn: async (): Promise<string[]> => {
      if (!user) return readGuestInterests();
      const { data, error } = await supabase
        .from("viewer_interests")
        .select("interests")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.interests ?? [];
    },
  });
};

export const useSaveInterests = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (interests: string[]): Promise<string[]> => {
      const clean = Array.from(
        new Set(interests.map((i) => i.trim()).filter(Boolean)),
      ).slice(0, MAX_INTERESTS);
      if (!user) {
        writeGuestInterests(clean);
        return clean;
      }
      const { error } = await supabase
        .from("viewer_interests")
        .upsert(
          { user_id: user.id, interests: clean, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (error) throw error;
      return clean;
    },
    onSuccess: (clean) => {
      qc.setQueryData(["interests", user?.id ?? "guest"], clean);
      // Fresh interests = fresh picks.
      void qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
};

export const readGuestInterestsSync = readGuestInterests;
export const useClearGuestInterests = () => {
  const clear = useCallback(() => writeGuestInterests([]), []);
  return clear;
};
