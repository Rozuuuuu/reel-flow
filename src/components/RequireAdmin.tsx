import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Server-authoritative admin gate.
 *
 * Calls the SECURITY INVOKER wrapper `public.has_role(uid, 'admin')` which
 * delegates to the private-schema SECURITY DEFINER helper. The check runs in
 * Postgres under the caller's JWT — clients cannot spoof it.
 */
export const useIsAdmin = (userId: string | undefined) =>
  useQuery({
    queryKey: ["is-admin", userId ?? "anon"],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId!,
        _role: "admin",
      });
      if (error) throw error;
      return data === true;
    },
  });

export const RequireAdmin = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { data: isAdmin, isLoading } = useIsAdmin(user?.id);

  if (loading || (user && isLoading)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page requires an administrator role. The server has rejected
          your request.
        </p>
      </div>
    );
  }
  return <>{children}</>;
};
