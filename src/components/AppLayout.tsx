import { Outlet, useLocation } from "react-router-dom";
import { BottomNav, SideNav, TopBar } from "./BottomNav";

export const AppLayout = () => {
  const { pathname } = useLocation();
  // The feed is a full-bleed snap viewport; other pages need padding for the nav
  const isFeed = pathname === "/";
  return (
    <div className="min-h-screen bg-background">
      <SideNav />
      <TopBar />
      <main
        className={
          isFeed
            ? "md:pl-20 lg:pl-56"
            : "pt-14 pb-24 md:pt-0 md:pb-6 md:pl-20 lg:pl-56"
        }
      >
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};
