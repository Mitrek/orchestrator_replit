import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { StatsCard } from "@/components/dashboard/stats-card";
import { ApiKeyCard } from "@/components/dashboard/api-key-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, ApiKey, RequestLog } from "@shared/schema";
import { Key, Activity, Clock, AlertTriangle, Plus, Download, Book, Plug, Play } from "lucide-react";
import { getAuthToken } from "@/lib/auth";
import React, { useState } from "react"; // Import React and useState

interface DashboardStats {
  activeKeys: number;
  totalRequests: number;
  avgResponseTime: number;
  errorRate: number;
}

export default function Dashboard({ user }: { user: User | null }) {
  const token = getAuthToken();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false); // State for dialog

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    enabled: !!token,
  });

  const { data: apiKeys, isLoading: keysLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/api-keys"],
    enabled: !!token,
  });

  const { data: requestLogs, isLoading: logsLoading } = useQuery<RequestLog[]>({
    queryKey: ["/api/request-logs"],
    enabled: !!token,
  });

  // Function to handle creating a new API key (placeholder)
  const handleCreateApiKey = () => {
    console.log("Creating new API key...");
    // Logic to create API key would go here
    setIsCreateDialogOpen(false); // Close the dialog after creation
  };

  if (statsLoading || keysLoading || logsLoading) {
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
      <div className="space-y-8" data-testid="dashboard">
        {/* Dashboard Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground mb-2" data-testid="dashboard-title">
              API Dashboard
            </h2>
            <p className="text-muted-foreground">
              Manage your API keys, monitor usage, and orchestrate third-party integrations
            </p>
          </div>
          <div className="flex items-center space-x-3 mt-4 sm:mt-0">
            <Button variant="outline" data-testid="button-export">
              <Download className="w-4 h-4 mr-2" />
              Export Data
            </Button>
            <Button data-testid="button-generate-key" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Generate API Key
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="Active API Keys"
            value={stats?.activeKeys || 0}
            description="Active API Keys"
            icon={Key}
            change="+12%"
            changeType="positive"
            iconBgColor="bg-primary/10 text-primary"
          />
          <StatsCard
            title="Requests Today"
            value={stats?.totalRequests || 0}
            description="Requests Today"
            icon={Activity}
            change="+8%"
            changeType="positive"
            iconBgColor="bg-secondary/10 text-secondary"
          />
          <StatsCard
            title="Avg Response Time"
            value={`${stats?.avgResponseTime || 0}ms`}
            description="Avg Response Time"
            icon={Clock}
            change="-3ms"
            changeType="positive"
            iconBgColor="bg-accent/10 text-accent"
          />
          <StatsCard
            title="Error Rate"
            value={`${stats?.errorRate || 0}%`}
            description="Error Rate"
            icon={AlertTriangle}
            change="-0.1%"
            changeType="positive"
            iconBgColor="bg-destructive/10 text-destructive"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* API Keys Management */}
          <div className="lg:col-span-2">
            <Card data-testid="api-keys-section">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>API Keys</CardTitle>
                  <Button variant="ghost" size="sm" data-testid="button-create-key" onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    Create New Key
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {apiKeys && apiKeys.length > 0 ? (
                  <div className="space-y-4">
                    {apiKeys.slice(0, 3).map((apiKey) => (
                      <ApiKeyCard
                        key={apiKey.id}
                        apiKey={apiKey}
                        usageCount={Math.floor(Math.random() * 500)} // Mock usage data
                        usagePercentage={Math.random() * 50}
                        // Pass the full apiKey to ApiKeyCard so it can be copied
                        fullApiKey={apiKey.key}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Key className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No API keys yet</p>
                    <Button
                      className="mt-4"
                      data-testid="button-create-first-key"
                      onClick={() => setIsCreateDialogOpen(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First API Key
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions & Recent Activity */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card data-testid="quick-actions">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  data-testid="action-generate-key"
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center mr-3">
                    <Plus className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Generate New Key</p>
                    <p className="text-sm text-muted-foreground">Create API key with custom limits</p>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start"
                  data-testid="action-add-integration"
                >
                  <div className="w-8 h-8 bg-secondary/10 rounded-lg flex items-center justify-center mr-3">
                    <Plug className="w-4 h-4 text-secondary" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Add Integration</p>
                    <p className="text-sm text-muted-foreground">Connect third-party API</p>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start"
                  data-testid="action-view-docs"
                >
                  <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center mr-3">
                    <Book className="w-4 h-4 text-accent" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">View Documentation</p>
                    <p className="text-sm text-muted-foreground">API reference and guides</p>
                  </div>
                </Button>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <ActivityFeed logs={requestLogs || []} />
          </div>
        </div>

        {/* API Documentation Preview */}
        <Card data-testid="api-docs-preview">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>API Documentation</CardTitle>
              <Button variant="ghost" size="sm" data-testid="link-full-docs">
                View Full Documentation
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="hover:bg-muted/50 transition-colors" data-testid="doc-quick-start">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-8 h-8 bg-secondary/10 rounded-lg flex items-center justify-center">
                      <Play className="w-4 h-4 text-secondary" />
                    </div>
                    <h4 className="font-medium">Quick Start</h4>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Get started with your first API request in under 5 minutes.
                  </p>
                  <div className="text-xs bg-muted rounded p-2 font-mono">
                    curl -H "X-API-Key: your_key" \<br />
                    &nbsp;&nbsp;https://api.ai-lure.com/v1/orchestrate
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:bg-muted/50 transition-colors" data-testid="doc-code-examples">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                      <code className="w-4 h-4 text-primary">{"{}"}</code>
                    </div>
                    <h4 className="font-medium">Code Examples</h4>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Ready-to-use code snippets in multiple programming languages.
                  </p>
                  <div className="flex space-x-2">
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">Python</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">Node.js</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">PHP</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:bg-muted/50 transition-colors" data-testid="doc-google-sheets">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center">
                      <Book className="w-4 h-4 text-accent" />
                    </div>
                    <h4 className="font-medium">Google Sheets</h4>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Learn how to integrate with Google Sheets as your frontend interface.
                  </p>
                  <div className="text-xs bg-muted rounded p-2 font-mono">
                    =IMPORTDATA("api.ai-lure.com/v1/data")
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Placeholder for the API Key creation dialog */}
      {/* This would typically be a modal component */}
      {isCreateDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold mb-4">Create New API Key</h2>
            {/* Add your API key creation form here */}
            <p>API Key creation form goes here...</p>
            <div className="mt-4 flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateApiKey}>Create Key</Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
```import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { StatsCard } from "@/components/dashboard/stats-card";
import { ApiKeyCard } from "@/components/dashboard/api-key-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, ApiKey, RequestLog } from "@shared/schema";
import { Key, Activity, Clock, AlertTriangle, Plus, Download, Book, Plug, Play } from "lucide-react";
import { getAuthToken } from "@/lib/auth";
import React, { useState } from "react"; // Import React and useState

interface DashboardStats {
  activeKeys: number;
  totalRequests: number;
  avgResponseTime: number;
  errorRate: number;
}

export default function Dashboard({ user }: { user: User | null }) {
  const token = getAuthToken();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false); // State for dialog

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    enabled: !!token,
  });

  const { data: apiKeys, isLoading: keysLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/api-keys"],
    enabled: !!token,
  });

  const { data: requestLogs, isLoading: logsLoading } = useQuery<RequestLog[]>({
    queryKey: ["/api/request-logs"],
    enabled: !!token,
  });

  // Function to handle creating a new API key (placeholder)
  const handleCreateApiKey = () => {
    console.log("Creating new API key...");
    // Logic to create API key would go here
    setIsCreateDialogOpen(false); // Close the dialog after creation
  };

  if (statsLoading || keysLoading || logsLoading) {
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
      <div className="space-y-8" data-testid="dashboard">
        {/* Dashboard Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground mb-2" data-testid="dashboard-title">
              API Dashboard
            </h2>
            <p className="text-muted-foreground">
              Manage your API keys, monitor usage, and orchestrate third-party integrations
            </p>
          </div>
          <div className="flex items-center space-x-3 mt-4 sm:mt-0">
            <Button variant="outline" data-testid="button-export">
              <Download className="w-4 h-4 mr-2" />
              Export Data
            </Button>
            <Button data-testid="button-generate-key" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Generate API Key
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="Active API Keys"
            value={stats?.activeKeys || 0}
            description="Active API Keys"
            icon={Key}
            change="+12%"
            changeType="positive"
            iconBgColor="bg-primary/10 text-primary"
          />
          <StatsCard
            title="Requests Today"
            value={stats?.totalRequests || 0}
            description="Requests Today"
            icon={Activity}
            change="+8%"
            changeType="positive"
            iconBgColor="bg-secondary/10 text-secondary"
          />
          <StatsCard
            title="Avg Response Time"
            value={`${stats?.avgResponseTime || 0}ms`}
            description="Avg Response Time"
            icon={Clock}
            change="-3ms"
            changeType="positive"
            iconBgColor="bg-accent/10 text-accent"
          />
          <StatsCard
            title="Error Rate"
            value={`${stats?.errorRate || 0}%`}
            description="Error Rate"
            icon={AlertTriangle}
            change="-0.1%"
            changeType="positive"
            iconBgColor="bg-destructive/10 text-destructive"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* API Keys Management */}
          <div className="lg:col-span-2">
            <Card data-testid="api-keys-section">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>API Keys</CardTitle>
                  <Button variant="ghost" size="sm" data-testid="button-create-key" onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    Create New Key
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {apiKeys && apiKeys.length > 0 ? (
                  <div className="space-y-4">
                    {apiKeys.slice(0, 3).map((apiKey) => (
                      <ApiKeyCard
                        key={apiKey.id}
                        apiKey={apiKey}
                        usageCount={Math.floor(Math.random() * 500)} // Mock usage data
                        usagePercentage={Math.random() * 50}
                        // Pass the full apiKey to ApiKeyCard so it can be copied
                        fullApiKey={apiKey.key}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Key className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No API keys yet</p>
                    <Button
                      className="mt-4"
                      data-testid="button-create-first-key"
                      onClick={() => setIsCreateDialogOpen(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First API Key
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions & Recent Activity */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card data-testid="quick-actions">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  data-testid="action-generate-key"
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center mr-3">
                    <Plus className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Generate New Key</p>
                    <p className="text-sm text-muted-foreground">Create API key with custom limits</p>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start"
                  data-testid="action-add-integration"
                >
                  <div className="w-8 h-8 bg-secondary/10 rounded-lg flex items-center justify-center mr-3">
                    <Plug className="w-4 h-4 text-secondary" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Add Integration</p>
                    <p className="text-sm text-muted-foreground">Connect third-party API</p>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start"
                  data-testid="action-view-docs"
                >
                  <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center mr-3">
                    <Book className="w-4 h-4 text-accent" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">View Documentation</p>
                    <p className="text-sm text-muted-foreground">API reference and guides</p>
                  </div>
                </Button>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <ActivityFeed logs={requestLogs || []} />
          </div>
        </div>

        {/* API Documentation Preview */}
        <Card data-testid="api-docs-preview">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>API Documentation</CardTitle>
              <Button variant="ghost" size="sm" data-testid="link-full-docs">
                View Full Documentation
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="hover:bg-muted/50 transition-colors" data-testid="doc-quick-start">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-8 h-8 bg-secondary/10 rounded-lg flex items-center justify-center">
                      <Play className="w-4 h-4 text-secondary" />
                    </div>
                    <h4 className="font-medium">Quick Start</h4>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Get started with your first API request in under 5 minutes.
                  </p>
                  <div className="text-xs bg-muted rounded p-2 font-mono">
                    curl -H "X-API-Key: your_key" \<br />
                    &nbsp;&nbsp;https://api.ai-lure.com/v1/orchestrate
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:bg-muted/50 transition-colors" data-testid="doc-code-examples">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                      <code className="w-4 h-4 text-primary">{"{}"}</code>
                    </div>
                    <h4 className="font-medium">Code Examples</h4>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Ready-to-use code snippets in multiple programming languages.
                  </p>
                  <div className="flex space-x-2">
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">Python</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">Node.js</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">PHP</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:bg-muted/50 transition-colors" data-testid="doc-google-sheets">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center">
                      <Book className="w-4 h-4 text-accent" />
                    </div>
                    <h4 className="font-medium">Google Sheets</h4>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Learn how to integrate with Google Sheets as your frontend interface.
                  </p>
                  <div className="text-xs bg-muted rounded p-2 font-mono">
                    =IMPORTDATA("api.ai-lure.com/v1/data")
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Placeholder for the API Key creation dialog */}
      {/* This would typically be a modal component */}
      {isCreateDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold mb-4">Create New API Key</h2>
            {/* Add your API key creation form here */}
            <p>API Key creation form goes here...</p>
            <div className="mt-4 flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateApiKey}>Create Key</Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}