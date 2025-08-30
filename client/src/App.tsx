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
import Integrations from "@/pages/integrations";
import Analytics from "@/pages/analytics";

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
      <Route path="/integrations" component={() => <Integrations user={user} />} />
      <Route path="/analytics" component={() => <Analytics user={user} />} />
      <Route path="/analytics/:tab" component={() => <Analytics user={user} />} />
      <Route path="/logs" component={() => <Analytics user={user} />} />
      <Route path="/docs" component={() => <Analytics user={user} />} />
      <Route path="/docs/:section" component={() => <Analytics user={user} />} />
      <Route path="/admin/:section" component={() => <Analytics user={user} />} />
      <Route path="/settings" component={() => <Analytics user={user} />} />
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

export default App;
