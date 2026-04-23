import { Outlet, useLocation } from "react-router-dom";
import { BottomNav, SideNav } from "./BottomNav";

export const AppLayout = () => {
  const { pathname } = useLocation();
  // The feed is a full-bleed snap viewport; other pages need padding for the nav
  const isFeed = pathname === "/";
  return (
    <div className="min-h-screen bg-background">
      <SideNav />
      <main
        className={
          isFeed
            ? "md:pl-20 lg:pl-56"
            : "pb-24 md:pb-6 md:pl-20 lg:pl-56"
        }
      >
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};
