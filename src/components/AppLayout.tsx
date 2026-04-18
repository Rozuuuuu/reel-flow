import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";

export const AppLayout = () => {
  const { pathname } = useLocation();
  // The feed is a full-bleed snap viewport; other pages need padding for the nav
  const isFeed = pathname === "/";
  return (
    <div className="min-h-screen bg-background">
      <main className={isFeed ? "" : "pb-24"}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};
