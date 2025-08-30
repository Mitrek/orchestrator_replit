import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Plug, Cloud, Database, Globe } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertIntegrationSchema, type InsertIntegration, type Integration, type User } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/auth";

const integrationTypes = [
  { value: "weather", label: "Weather API", icon: Cloud },
  { value: "news", label: "News API", icon: Globe },
  { value: "social", label: "Social Media", icon: Database },
  { value: "financial", label: "Financial Data", icon: Database },
  { value: "maps", label: "Maps & Location", icon: Globe },
  { value: "ai", label: "AI Services", icon: Database },
];

export default function Integrations({ user }: { user: User | null }) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();
  const token = getAuthToken();

  const { data: integrations, isLoading } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
    enabled: !!token,
  });

  const form = useForm<InsertIntegration>({
    resolver: zodResolver(insertIntegrationSchema.omit({ userId: true })),
    defaultValues: {
      name: "",
      type: "",
      baseUrl: "",
      apiKey: "",
      isActive: true,
      configuration: {},
    },
  });

  const createIntegrationMutation = useMutation({
    mutationFn: async (data: InsertIntegration) => {
      const response = await apiRequest("POST", "/api/integrations", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: "Integration Created",
        description: `New integration "${data.name}" has been added successfully.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create integration",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateIntegration = (data: InsertIntegration) => {
    createIntegrationMutation.mutate(data);
  };

  const getIntegrationIcon = (type: string) => {
    const integType = integrationTypes.find(t => t.value === type);
    return integType ? integType.icon : Plug;
  };

  const getIntegrationLabel = (type: string) => {
    const integType = integrationTypes.find(t => t.value === type);
    return integType ? integType.label : type;
  };

  if (isLoading) {
    return (
      <Layout user={user}>
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-muted rounded-lg"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout user={user}>
      <div className="space-y-8" data-testid="integrations-page">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground mb-2" data-testid="page-title">
              Integrations
            </h2>
            <p className="text-muted-foreground">
              Connect and manage third-party API integrations
            </p>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-integration">
                <Plus className="w-4 h-4 mr-2" />
                Add Integration
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md" data-testid="create-integration-dialog">
              <DialogHeader>
                <DialogTitle>Add New Integration</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleCreateIntegration)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., OpenWeather API" 
                            {...field} 
                            data-testid="input-integration-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-integration-type">
                              <SelectValue placeholder="Select integration type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {integrationTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="baseUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base URL</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="https://api.example.com" 
                            {...field} 
                            data-testid="input-base-url"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="apiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>API Key (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            type="password"
                            placeholder="Enter API key if required" 
                            {...field} 
                            data-testid="input-api-key"
                          />
                        </FormControl>
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
                      disabled={createIntegrationMutation.isPending}
                      data-testid="button-create"
                    >
                      {createIntegrationMutation.isPending ? "Adding..." : "Add Integration"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Integrations Grid */}
        {integrations && integrations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="integrations-grid">
            {integrations.map((integration) => {
              const Icon = getIntegrationIcon(integration.type);
              return (
                <Card 
                  key={integration.id} 
                  className="hover:shadow-lg transition-shadow" 
                  data-testid={`integration-card-${integration.id}`}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg" data-testid={`integration-name-${integration.id}`}>
                            {integration.name}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {getIntegrationLabel(integration.type)}
                          </p>
                        </div>
                      </div>
                      <Badge 
                        variant={integration.isActive ? "default" : "secondary"}
                        data-testid={`integration-status-${integration.id}`}
                      >
                        {integration.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Base URL</p>
                        <p className="text-sm text-muted-foreground truncate" data-testid={`integration-url-${integration.id}`}>
                          {integration.baseUrl}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Created</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(integration.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          data-testid={`test-integration-${integration.id}`}
                        >
                          Test
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          data-testid={`edit-integration-${integration.id}`}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card data-testid="no-integrations">
            <CardContent className="text-center py-12">
              <Plug className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Integrations Yet</h3>
              <p className="text-muted-foreground mb-6">
                Connect third-party APIs to start orchestrating data from multiple sources.
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-add-first-integration">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Integration
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Popular Integrations Suggestions */}
        <Card data-testid="popular-integrations">
          <CardHeader>
            <CardTitle>Popular Integrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {integrationTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <div 
                    key={type.value} 
                    className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => {
                      form.setValue("type", type.value);
                      setIsCreateDialogOpen(true);
                    }}
                    data-testid={`suggested-integration-${type.value}`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{type.label}</p>
                        <p className="text-sm text-muted-foreground">Click to add</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
