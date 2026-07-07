import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireAdmin } from "@/components/RequireAdmin";
import { DeepLinkRedirector } from "@/components/DeepLinkRedirector";
import Auth from "./pages/Auth.tsx";
import Feed from "./pages/Feed.tsx";
import Search from "./pages/Search.tsx";
import Upload from "./pages/Upload.tsx";
import Profile from "./pages/Profile.tsx";
import UserProfile from "./pages/UserProfile.tsx";
import AdminReports from "./pages/AdminReports.tsx";
import NotFound from "./pages/NotFound.tsx";
import Saved from "./pages/Saved.tsx";
import SecurityPolicy from "./pages/SecurityPolicy.tsx";
import SecurityCoverage from "./pages/SecurityCoverage.tsx";
import SecurityMatrix from "./pages/SecurityMatrix.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner theme="dark" position="top-center" />
      <BrowserRouter>
        <AuthProvider>
          <DeepLinkRedirector />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            {/* Public routes — guests can browse the feed, search, and view profiles */}
            <Route element={<AppLayout />}>
              <Route path="/" element={<Feed />} />
              <Route path="/search" element={<Search />} />
              <Route path="/u/:username" element={<UserProfile />} />
              <Route path="/saved" element={<Saved />} />
              <Route path="/security" element={<SecurityPolicy />} />
              <Route path="/security/coverage" element={<SecurityCoverage />} />
              <Route path="/security/matrix" element={<RequireAdmin><SecurityMatrix /></RequireAdmin>} />
            </Route>
            {/* Member-only routes */}
            <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route path="/upload" element={<Upload />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/admin/reports" element={<AdminReports />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
