import { useCallback, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { LoginPromptModal } from "@/components/LoginPromptModal";

/**
 * Gate a callback behind authentication. Returns:
 *   - `requireAuth(action, fn)` — runs `fn` immediately if signed in,
 *     otherwise opens a friendly login prompt explaining `action`.
 *   - `gate` — JSX to mount once in the consuming component.
 */
export const useAuthGate = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<string | undefined>(undefined);

  const requireAuth = useCallback(
    (intendedAction: string, fn: () => void) => {
      if (user) {
        fn();
        return true;
      }
      setAction(intendedAction);
      setOpen(true);
      return false;
    },
    [user],
  );

  const gate = (
    <LoginPromptModal open={open} onOpenChange={setOpen} action={action} />
  );

  return { requireAuth, gate, isGuest: !user };
};
