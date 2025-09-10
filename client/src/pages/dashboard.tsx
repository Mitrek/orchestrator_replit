import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Layout } from "@/components/layout/layout";
import { StatsCard } from "@/components/dashboard/stats-card";
import { ApiKeyCard } from "@/components/dashboard/api-key-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { User, ApiKey, RequestLog, InsertApiKey, insertApiKeySchema } from "@shared/schema";
import { Key, Activity, Clock, AlertTriangle, Plus, Download, Book, Play, Copy } from "lucide-react";
import { getAuthToken } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import React, { useState } from "react";

interface DashboardStats {
  activeKeys: number;
  totalRequests: number;
  avgResponseTime: number;
  errorRate: number;
}

export default function Dashboard({ user }: { user: User | null }) {
  const token = getAuthToken();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [apiKeyPlain, setApiKeyPlain] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    enabled: !!token,
  });

  const { data: apiKeys, isLoading: keysLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/keys"],
    enabled: !!token,
  });

  const { data: requestLogs, isLoading: logsLoading } = useQuery<RequestLog[]>({
    queryKey: ["/api/request-logs"],
    enabled: !!token,
  });

  const form = useForm<InsertApiKey>({
    resolver: zodResolver(insertApiKeySchema.omit({ userId: true })),
    defaultValues: {
      name: "",
      isActive: true,
    },
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async (data: InsertApiKey) => {
      const response = await apiRequest("POST", "/api/keys", data);
      return response.json() as Promise<{ apiKey?: string; name?: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      setIsCreateDialogOpen(false);
      form.reset();
      
      if (data.apiKey) {
        setApiKeyPlain(data.apiKey);
        setShowKeyDialog(true);
        toast({
          title: "API Key Created",
          description: "Your new API key has been generated. Make sure to copy it now!",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to create API key",
        variant: "destructive",
      });
    },
  });

  const handleCreateApiKey = (data: InsertApiKey) => {
    createApiKeyMutation.mutate(data);
  };

  const copyKey = async () => {
    if (!apiKeyPlain) return;
    try {
      await navigator.clipboard.writeText(apiKeyPlain);
      toast({
        title: "Copied",
        description: "Your API key has been copied to the clipboard.",
      });
    } catch (e: any) {
      toast({
        title: "Copy failed",
        description: e?.message ?? "Could not copy to clipboard.",
        variant: "destructive",
      });
    }
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
              Manage your API keys and monitor usage
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
            value={stats?.activeKeys ?? 0}
            description="Active API Keys"
            icon={Key}
            change="Coming soon"
            changeType="neutral"
            iconBgColor="bg-primary/10 text-primary"
          />
          <StatsCard
            title="Requests Today"
            value={stats?.totalRequests ?? 0}
            description="Requests Today"
            icon={Activity}
            change="Coming soon"
            changeType="neutral"
            iconBgColor="bg-secondary/10 text-secondary"
          />
          <StatsCard
            title="Avg Response Time"
            value={(stats?.avgResponseTime ?? 0) + "ms"}
            description="Avg Response Time"
            icon={Clock}
            change="Coming soon"
            changeType="neutral"
            iconBgColor="bg-accent/10 text-accent"
          />
          <StatsCard
            title="Error Rate"
            value={(stats?.errorRate ?? 0) + "%"}
            description="Error Rate"
            icon={AlertTriangle}
            change="Coming soon"
            changeType="neutral"
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
                        usageCount="Coming soon"
                        usagePercentage="Coming soon"
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
                    curl -H "X-API-Key: your_key" <br />
                    https://api.ai-lure.com/v1/orchestrate
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

              <Card className="hover/bg-muted/50 transition-colors" data-testid="doc-google-sheets">
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

      {/* Create API Key Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New API Key</DialogTitle>
            <DialogDescription>
              Generate a new API key for accessing the platform. You can set a custom rate limit and name.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreateApiKey)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Key Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My API Key" {...field} data-testid="input-api-key-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rateLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate Limit (requests per hour)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="10000"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        data-testid="input-rate-limit"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createApiKeyMutation.isPending} data-testid="button-submit-create-key">
                  {createApiKeyMutation.isPending ? "Creating..." : "Create Key"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* One-time API key display dialog */}
      <Dialog
        open={showKeyDialog}
        onOpenChange={(open) => {
          if (!open) setApiKeyPlain(null);
          setShowKeyDialog(open);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription>
              This key is shown <strong>only once</strong>. Copy and store it securely — you won't be able to see it again.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex items-center gap-2">
            <Input readOnly value={apiKeyPlain ?? ""} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="secondary" onClick={copyKey} disabled={!apiKeyPlain} data-testid="copy-api-key">
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}