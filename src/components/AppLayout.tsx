import { Outlet, useLocation } from "react-router-dom";
import { BottomNav, SideNav, TopBar } from "./BottomNav";
import { ErrorBoundary } from "./ErrorBoundary";
import { useGuestSavesSync } from "@/hooks/useSavedVideos";

export const AppLayout = () => {
  const { pathname } = useLocation();
  const isFeed = pathname === "/";
  useGuestSavesSync();
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
        <ErrorBoundary name="Page">
          <Outlet />
        </ErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
};
