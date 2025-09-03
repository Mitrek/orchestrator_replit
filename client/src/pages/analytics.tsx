import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { StatsCard } from "@/components/dashboard/stats-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Clock, AlertTriangle, Activity } from "lucide-react";
import { User } from "@shared/schema";
import { getAuthToken } from "@/lib/auth";

export default function Analytics({ user }: { user: User | null }) {
  const token = getAuthToken();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <Layout user={user}>
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-muted rounded-lg"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout user={user}>
      <div className="space-y-8" data-testid="analytics-page">
        {/* Page Header */}
        <div>
          <h2 className="text-2xl font-semibold text-foreground mb-2" data-testid="page-title">
            Analytics
          </h2>
          <p className="text-muted-foreground">
            Monitor your API usage, performance metrics, and error rates
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="Total Requests"
            value={stats?.totalRequests || 0}
            description="Requests Today"
            icon={Activity}
            change="+8%"
            changeType="positive"
            iconBgColor="bg-primary/10 text-primary"
          />
          <StatsCard
            title="Success Rate"
            value={`${100 - (stats?.errorRate || 0)}%`}
            description="Successful Requests"
            icon={TrendingUp}
            change="+2.1%"
            changeType="positive"
            iconBgColor="bg-secondary/10 text-secondary"
          />
          <StatsCard
            title="Avg Response Time"
            value={`${stats?.avgResponseTime || 0}ms`}
            description="Response Time"
            icon={Clock}
            change="-15ms"
            changeType="positive"
            iconBgColor="bg-accent/10 text-accent"
          />
          <StatsCard
            title="Error Rate"
            value={`${stats?.errorRate || 0}%`}
            description="Failed Requests"
            icon={AlertTriangle}
            change="-0.3%"
            changeType="positive"
            iconBgColor="bg-destructive/10 text-destructive"
          />
        </div>

        {/* Analytics Charts Placeholder */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card data-testid="usage-chart">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5" />
                <span>API Usage Over Time</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center bg-muted rounded-lg">
                <p className="text-muted-foreground">Coming soon</p>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="response-time-chart">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="w-5 h-5" />
                <span>Response Time Trends</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center bg-muted rounded-lg">
                <p className="text-muted-foreground">Coming soon</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="error-analysis">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Error Analysis</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 flex items-center justify-center bg-muted rounded-lg">
              <p className="text-muted-foreground">Coming soon</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}