import { NavLink, useNavigate } from "react-router-dom";
import { Home, Plus, User, Search, LogIn, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationsBell } from "@/components/NotificationsBell";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthGate } from "@/hooks/useAuthGate";
import { Button } from "@/components/ui/button";

const sideItems = [
  { to: "/", label: "Feed", icon: Home, requiresAuth: false, action: "" },
  { to: "/search", label: "Search", icon: Search, requiresAuth: false, action: "" },
  { to: "/upload", label: "Upload", icon: Plus, requiresAuth: true, action: "post a reel" },
  { to: "/profile", label: "Profile", icon: User, requiresAuth: true, action: "view your profile" },
];

/** Editorial wordmark — Instrument Serif italic with sunset gradient + ribbon. */
const Wordmark = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  const sz = size === "lg" ? "text-3xl" : size === "sm" ? "text-xl" : "text-2xl";
  return (
    <span className="relative inline-block leading-none">
      <span
        className={cn(
          "font-display italic tracking-tight text-gradient-brand",
          sz,
        )}
      >
        Reelo
      </span>
      <span
        aria-hidden
        className="absolute -bottom-1 left-0 h-[2px] w-10 rounded-full bg-gradient-to-r from-sunset-iris via-sunset-pink to-transparent opacity-70"
      />
    </span>
  );
};

/** Top notification bar — visible on mobile only. */
export const TopBar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <header
      aria-label="Notifications"
      className="fixed top-0 left-0 right-0 z-50 glass-strong md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* hairline ribbon */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-px ribbon opacity-60" />
      <div className="mx-auto flex max-w-md items-center justify-between px-5 py-2.5">
        <Wordmark />
        {user ? (
          <NotificationsBell />
        ) : (
          <Button
            size="sm"
            variant="brand"
            className="rounded-full"
            onClick={() => navigate("/auth")}
          >
            <LogIn className="mr-1 h-4 w-4" />
            Sign in
          </Button>
        )}
      </div>
    </header>
  );
};

/** Bottom tab bar — floating editorial dock, mobile only. */
export const BottomNav = () => {
  const { requireAuth, gate } = useAuthGate();
  const navigate = useNavigate();

  const tabs = [
    { to: "/", label: "Feed", icon: Home, requiresAuth: false, action: "" },
    { to: "/search", label: "Search", icon: Search, requiresAuth: false, action: "" },
  ];
  const rightTabs = [
    { to: "/saved", label: "Saved", icon: Bookmark, requiresAuth: true, action: "view your saved reels" },
    { to: "/profile", label: "Profile", icon: User, requiresAuth: true, action: "view your profile" },
  ];

  const renderTab = (t: typeof tabs[number]) => {
    const Icon = t.icon;
    if (t.requiresAuth) {
      return (
        <button
          key={t.to}
          type="button"
          onClick={() => requireAuth(t.action, () => navigate(t.to))}
          className="group flex flex-1 flex-col items-center gap-1 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <Icon className="h-[22px] w-[22px]" strokeWidth={1.75} />
          <span>{t.label}</span>
        </button>
      );
    }
    return (
      <NavLink
        key={t.to}
        to={t.to}
        end={t.to === "/"}
        className={({ isActive }) =>
          cn(
            "group flex flex-1 flex-col items-center gap-1 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors",
            isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
          )
        }
      >
        {({ isActive }) => (
          <>
            <Icon
              className={cn(
                "h-[22px] w-[22px]",
                isActive && "drop-shadow-[0_0_10px_hsl(var(--sunset-pink)/0.7)]",
              )}
              strokeWidth={isActive ? 2 : 1.75}
            />
            <span>{t.label}</span>
          </>
        )}
      </NavLink>
    );
  };

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto max-w-md px-4">
          <div className="relative">
            {/* Elevated upload button */}
            <button
              type="button"
              aria-label="Upload a reel"
              onClick={() => requireAuth("post a reel", () => navigate("/upload"))}
              className="absolute left-1/2 -top-7 z-10 -translate-x-1/2 rounded-2xl bg-gradient-brand p-[1.5px] shadow-glow transition-transform active:scale-95"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-background">
                <span className="flex h-full w-full items-center justify-center rounded-[14px] bg-gradient-brand-soft">
                  <Plus className="h-7 w-7 text-foreground" strokeWidth={2.25} />
                </span>
              </span>
            </button>

            <div className="glass-strong relative overflow-hidden rounded-[28px] border border-border/70 px-3 py-1.5 shadow-soft">
              <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px ribbon opacity-70" />
              <div className="flex items-center">
                {tabs.map(renderTab)}
                {/* center spacer for the floating upload */}
                <div aria-hidden className="w-16 shrink-0" />
                {rightTabs.map(renderTab)}
              </div>
            </div>
          </div>
        </div>
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
        <div className="mb-10 flex items-center justify-center lg:justify-start lg:px-2">
          <Wordmark size="lg" />
        </div>
        <ul className="flex flex-1 flex-col gap-1">
          {sideItems.map(({ to, label, icon: Icon, requiresAuth, action }) => {
            const baseCls =
              "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium uppercase tracking-[0.14em] transition-colors justify-center lg:justify-start";
            if (requiresAuth) {
              return (
                <li key={to}>
                  <button
                    type="button"
                    onClick={() => requireAuth(action, () => navigate(to))}
                    className={cn(baseCls, "text-muted-foreground hover:bg-accent/15 hover:text-foreground")}
                  >
                    <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                    <span className="hidden text-xs lg:inline">{label}</span>
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
                        ? "bg-gradient-brand-soft text-foreground"
                        : "text-muted-foreground hover:bg-accent/15 hover:text-foreground",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={cn(
                          "h-5 w-5 shrink-0",
                          isActive && "drop-shadow-[0_0_8px_hsl(var(--sunset-pink)/0.7)]",
                        )}
                        strokeWidth={isActive ? 2 : 1.75}
                      />
                      <span className="hidden text-xs lg:inline">{label}</span>
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
                className="w-full rounded-full"
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
