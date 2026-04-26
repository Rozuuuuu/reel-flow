import { NavLink } from "react-router-dom";
import { Home, PlusSquare, User, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationsBell } from "@/components/NotificationsBell";

const items = [
  { to: "/", label: "Feed", icon: Home },
  { to: "/search", label: "Search", icon: Search },
  { to: "/upload", label: "Upload", icon: PlusSquare },
  { to: "/profile", label: "Profile", icon: User },
];

/** Top notification bar — visible on mobile only. */
export const TopBar = () => {
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
        <NotificationsBell />
      </div>
    </header>
  );
};

/** Bottom tab bar — visible on mobile only. */
export const BottomNav = () => {
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-center justify-around px-4 py-2">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
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
          </li>
        ))}
      </ul>
    </nav>
  );
};

/** Vertical sidebar — visible on tablet/desktop. */
export const SideNav = () => {
  return (
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
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                  "justify-center lg:justify-start",
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
        ))}
        <li className="mt-1 flex items-center justify-center lg:justify-start">
          <NotificationsBell />
        </li>
      </ul>
    </aside>
  );
};
