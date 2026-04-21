import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useMyFollowingIds, toggleFollow } from "@/hooks/useFollows";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  targetUserId: string;
  size?: "sm" | "default";
  className?: string;
}

export const FollowButton = ({ targetUserId, size = "sm", className }: Props) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: followingIds } = useMyFollowingIds(user?.id);

  if (!user || user.id === targetUserId) return null;

  const isFollowing = (followingIds ?? []).includes(targetUserId);

  return (
    <Button
      type="button"
      size={size}
      variant={isFollowing ? "outline" : "brand"}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleFollow(user.id, targetUserId, isFollowing, qc);
      }}
      className={cn("min-w-20", className)}
    >
      {isFollowing ? "Following" : "Follow"}
    </Button>
  );
};
