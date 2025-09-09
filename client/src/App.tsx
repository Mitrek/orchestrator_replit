import { useEffect, useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getCurrentUser, isAuthenticated } from "./lib/auth";
import { User } from "@shared/schema";
import NotFound from "@/pages/not-found";
import Login from "@/pages/auth/login";
import Register from "@/pages/auth/register";
import Dashboard from "@/pages/dashboard";
import ApiKeys from "@/pages/api-keys";
import AnalyticsPage from "@/pages/analytics"; // Renamed from Analytics to AnalyticsPage to avoid conflict
import Settings from "./pages/settings";
import CodeExamples from "./pages/code-examples";
import RequestLogs from "./pages/request-logs";
import Documentation from "./pages/documentation"; // Assuming documentation page exists
import { FEATURE_HEATMAP_DEV_UI } from "./config/featureFlags";
import DevHeatmap from "./pages/DevHeatmap";

function Router() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      if (isAuthenticated()) {
        try {
          const currentUser = await getCurrentUser();
          setUser(currentUser);
        } catch (error) {
          console.error("Failed to get current user:", error);
        }
      }
      setIsLoading(false);
    };

    checkAuth();

    // Listen for authentication changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_token') {
        checkAuth();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated()) {
    return (
      <Switch>
        <Route path="/register" component={Register} />
        <Route path="/login" component={Login} />
        <Route component={Login} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/" component={() => <Dashboard user={user} />} />
      <Route path="/api-keys" component={() => <ApiKeys user={user} />} />
      {/* Removed: <Route path="/integrations" component={() => <Integrations user={user} />} /> */}
      <Route path="/analytics" component={() => <AnalyticsPage user={user} />} />
      <Route path="/analytics/:tab" component={() => <AnalyticsPage user={user} />} />
      {/* Removed: <Route path="/logs" component={() => <Analytics user={user} />} /> */}
      {/* Removed: <Route path="/docs" component={() => <Analytics user={user} />} /> */}
      {/* Removed: <Route path="/docs/:section" component={() => <Analytics user={user} />} /> */}
      {/* Removed: <Route path="/admin/:section" component={() => <Analytics user={user} />} /> */}
      {/* Removed: <Route path="/settings" component={() => <Analytics user={user} />} /> */}
      <Route path="/settings" component={() => <Settings user={user} />} />
      <Route path="/docs" component={() => <Documentation user={user} />} />
      <Route path="/docs/examples" component={() => <CodeExamples user={user} />} />
      <Route path="/logs" component={() => <RequestLogs user={user} />} />
      {FEATURE_HEATMAP_DEV_UI && (
        <Route path="/dev/heatmap" component={DevHeatmap} />
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function HomePage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Heatmap API</h1>
        <p className="text-gray-600">Heatmap generation service is running</p>
        {FEATURE_HEATMAP_DEV_UI && (
          <div className="mt-4">
            <a
              href="/dev/heatmap"
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Open Dev UI
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;