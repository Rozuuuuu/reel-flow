import { NavLink } from "react-router-dom";
import { Home, PlusSquare, User, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Feed", icon: Home },
  { to: "/search", label: "Search", icon: Search },
  { to: "/upload", label: "Upload", icon: PlusSquare },
  { to: "/profile", label: "Profile", icon: User },
];

export const BottomNav = () => {
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border"
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
