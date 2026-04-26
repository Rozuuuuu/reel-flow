import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the user was trying to do — e.g. "like this reel". */
  action?: string;
}

/** Friendly auth prompt shown when a guest tries a member-only action. */
export const LoginPromptModal = ({ open, onOpenChange, action }: Props) => {
  const navigate = useNavigate();
  const goAuth = (mode: "signin" | "signup") => {
    onOpenChange(false);
    const from = window.location.pathname + window.location.search;
    navigate(`/auth?mode=${mode}`, { state: { from } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Lock className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">
            Join Reelo to {action ?? "continue"}
          </DialogTitle>
          <DialogDescription className="text-center">
            Create a free account to like, comment, follow creators, and post
            your own reels. Browsing stays free either way.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-col-reverse">
          <Button variant="outline" onClick={() => goAuth("signin")}>
            I already have an account
          </Button>
          <Button variant="brand" onClick={() => goAuth("signup")}>
            Create free account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
