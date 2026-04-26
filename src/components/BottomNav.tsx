import { NavLink, useNavigate } from "react-router-dom";
import { Home, PlusSquare, User, Search, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationsBell } from "@/components/NotificationsBell";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthGate } from "@/hooks/useAuthGate";
import { Button } from "@/components/ui/button";

const items = [
  { to: "/", label: "Feed", icon: Home, requiresAuth: false, action: "" },
  { to: "/search", label: "Search", icon: Search, requiresAuth: false, action: "" },
  { to: "/upload", label: "Upload", icon: PlusSquare, requiresAuth: true, action: "post a reel" },
  { to: "/profile", label: "Profile", icon: User, requiresAuth: true, action: "view your profile" },
];

/** Top notification bar — visible on mobile only. */
export const TopBar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <header
      aria-label="Notifications"
      className="fixed top-0 left-0 right-0 z-50 glass border-b border-border md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-2">
        <span className="text-gradient-brand text-lg font-bold tracking-tight">
          Reelo
        </span>
        {user ? (
          <NotificationsBell />
        ) : (
          <Button size="sm" variant="brand" onClick={() => navigate("/auth")}>
            <LogIn className="mr-1 h-4 w-4" />
            Sign in
          </Button>
        )}
      </div>
    </header>
  );
};

/** Bottom tab bar — visible on mobile only. */
export const BottomNav = () => {
  const { requireAuth, gate } = useAuthGate();
  const navigate = useNavigate();
  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto flex max-w-md items-center justify-around px-4 py-2">
          {items.map(({ to, label, icon: Icon, requiresAuth, action }) => (
            <li key={to}>
              {requiresAuth ? (
                <button
                  type="button"
                  onClick={() =>
                    requireAuth(action, () => navigate(to))
                  }
                  className="flex flex-col items-center gap-0.5 rounded-md px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Icon className="h-6 w-6" />
                  <span>{label}</span>
                </button>
              ) : (
                <NavLink
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center gap-0.5 rounded-md px-4 py-2 text-xs font-medium transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={cn("h-6 w-6", isActive && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]")} />
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>
      {gate}
    </>
  );
};

/** Vertical sidebar — visible on tablet/desktop. */
export const SideNav = () => {
  const { user } = useAuth();
  const { requireAuth, gate } = useAuthGate();
  const navigate = useNavigate();
  return (
    <>
      <aside
        aria-label="Primary"
        className="fixed inset-y-0 left-0 z-40 hidden w-20 flex-col items-center border-r border-border bg-card/60 py-6 backdrop-blur-md md:flex lg:w-56 lg:items-stretch lg:px-4"
      >
        <div className="mb-8 flex items-center justify-center lg:justify-start lg:px-2">
          <span className="text-gradient-brand text-xl font-bold tracking-tight lg:text-2xl">
            Reelo
          </span>
        </div>
        <ul className="flex flex-1 flex-col gap-1">
          {items.map(({ to, label, icon: Icon, requiresAuth, action }) => {
            const baseCls =
              "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors justify-center lg:justify-start";
            if (requiresAuth) {
              return (
                <li key={to}>
                  <button
                    type="button"
                    onClick={() => requireAuth(action, () => navigate(to))}
                    className={cn(baseCls, "text-muted-foreground hover:bg-accent/40 hover:text-foreground")}
                  >
                    <Icon className="h-6 w-6 shrink-0" />
                    <span className="hidden lg:inline">{label}</span>
                  </button>
                </li>
              );
            }
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    cn(
                      baseCls,
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={cn(
                          "h-6 w-6 shrink-0",
                          isActive && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]",
                        )}
                      />
                      <span className="hidden lg:inline">{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
          {user ? (
            <li className="mt-1 flex items-center justify-center lg:justify-start">
              <NotificationsBell />
            </li>
          ) : (
            <li className="mt-2">
              <Button
                variant="brand"
                size="sm"
                className="w-full"
                onClick={() => navigate("/auth")}
              >
                <LogIn className="mr-1 h-4 w-4" />
                <span className="hidden lg:inline">Sign in</span>
              </Button>
            </li>
          )}
        </ul>
      </aside>
      {gate}
    </>
  );
};
