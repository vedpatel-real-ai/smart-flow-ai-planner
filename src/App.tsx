import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { DataProvider } from "@/providers/DataProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Layout from "./components/Layout";
import NotFound from "./pages/NotFound";

function AppRoutes() {
  const { user, mode } = useAuth();
  if (!user) return <Auth />;
  return <Layout key={mode + "/" + user.id}><DataProvider><Routes>
    <Route path="/" element={<Dashboard />} /><Route path="*" element={<NotFound />}/>
  </Routes></DataProvider></Layout>;
}

function AppWithErrorBoundary() {
  const { mode } = useAuth();
  return <ErrorBoundary mode={mode}>
    <AppRoutes />
  </ErrorBoundary>;
}

export default function App() {
  return <AuthProvider><TooltipProvider><Toaster/><Sonner/><BrowserRouter>
    <AppWithErrorBoundary/>
  </BrowserRouter></TooltipProvider></AuthProvider>;
}
