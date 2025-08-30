import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { ApiKeyCard } from "@/components/dashboard/api-key-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Key } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertApiKeySchema, type InsertApiKey, type ApiKey, type User } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/auth";

export default function ApiKeys({ user }: { user: User | null }) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();
  const token = getAuthToken();

  const { data: apiKeys, isLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/api-keys"],
    enabled: !!token,
  });

  const form = useForm<InsertApiKey>({
    resolver: zodResolver(insertApiKeySchema.omit({ userId: true })),
    defaultValues: {
      name: "",
      rateLimit: 1000,
      isActive: true,
    },
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async (data: InsertApiKey) => {
      const response = await apiRequest("POST", "/api/api-keys", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: "API Key Created",
        description: `New API key "${data.name}" has been created successfully.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create API key",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/api-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      toast({
        title: "API Key Deleted",
        description: "The API key has been permanently deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete API key",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateApiKey = (data: InsertApiKey) => {
    createApiKeyMutation.mutate(data);
  };

  const handleRegenerateKey = (id: string) => {
    // Implementation for regenerating API key
    toast({
      title: "Coming Soon",
      description: "API key regeneration will be available soon.",
    });
  };

  if (isLoading) {
    return (
      <Layout user={user}>
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-muted rounded-lg"></div>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout user={user}>
      <div className="space-y-8" data-testid="api-keys-page">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground mb-2" data-testid="page-title">
              API Keys
            </h2>
            <p className="text-muted-foreground">
              Manage your API keys and access credentials
            </p>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-api-key">
                <Plus className="w-4 h-4 mr-2" />
                Create API Key
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="create-api-key-dialog">
              <DialogHeader>
                <DialogTitle>Create New API Key</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleCreateApiKey)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., Production API Key" 
                            {...field} 
                            data-testid="input-api-key-name"
                          />
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
                        <Select 
                          onValueChange={(value) => field.onChange(parseInt(value))} 
                          defaultValue={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-rate-limit">
                              <SelectValue placeholder="Select rate limit" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="100">100 requests/hour</SelectItem>
                            <SelectItem value="500">500 requests/hour</SelectItem>
                            <SelectItem value="1000">1,000 requests/hour</SelectItem>
                            <SelectItem value="5000">5,000 requests/hour</SelectItem>
                            <SelectItem value="10000">10,000 requests/hour</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="flex justify-end space-x-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsCreateDialogOpen(false)}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createApiKeyMutation.isPending}
                      data-testid="button-create"
                    >
                      {createApiKeyMutation.isPending ? "Creating..." : "Create"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* API Keys List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Key className="w-5 h-5" />
              <span>Your API Keys</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {apiKeys && apiKeys.length > 0 ? (
              <div className="space-y-4" data-testid="api-keys-list">
                {apiKeys.map((apiKey) => (
                  <ApiKeyCard
                    key={apiKey.id}
                    apiKey={apiKey}
                    onRegenerate={handleRegenerateKey}
                    usageCount={Math.floor(Math.random() * (apiKey.rateLimit || 1000))}
                    usagePercentage={Math.random() * 100}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12" data-testid="no-api-keys">
                <Key className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No API Keys Yet</h3>
                <p className="text-muted-foreground mb-6">
                  Create your first API key to start using the Ai-lure Orchestrator platform.
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-key">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First API Key
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
