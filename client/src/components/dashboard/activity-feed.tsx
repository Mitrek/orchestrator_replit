import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestLog } from "@shared/schema";
import { Check, Key, AlertTriangle, Plug } from "lucide-react";

interface ActivityFeedProps {
  logs: RequestLog[];
}

export function ActivityFeed({ logs }: ActivityFeedProps) {
  const getActivityIcon = (log: RequestLog) => {
    if (log.statusCode >= 400) {
      return <AlertTriangle className="w-4 h-4 text-accent" />;
    }
    
    switch (log.endpoint) {
      case "/api/api-keys":
        return <Key className="w-4 h-4 text-primary" />;
      case "/api/integrations":
        return <Plug className="w-4 h-4 text-secondary" />;
      default:
        return <Check className="w-4 h-4 text-secondary" />;
    }
  };

  const getActivityMessage = (log: RequestLog) => {
    if (log.statusCode >= 400) {
      return `Error ${log.statusCode}: ${log.errorMessage || "Request failed"}`;
    }
    
    switch (log.endpoint) {
      case "/api/api-keys":
        return log.method === "POST" ? "New API key generated" : "API key updated";
      case "/api/integrations":
        return "Integration configured";
      case "/api/v1/orchestrate":
        return "API request completed";
      default:
        return "Request processed";
    }
  };

  const getActivityDescription = (log: RequestLog) => {
    const timestamp = new Date(log.timestamp);
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    let timeAgo = "";
    if (diffHours > 0) {
      timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffMins > 0) {
      timeAgo = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    } else {
      timeAgo = "Just now";
    }

    return `${log.method} ${log.endpoint} • ${timeAgo}`;
  };

  const getIconBgClass = (log: RequestLog) => {
    if (log.statusCode >= 400) {
      return "bg-accent/10";
    }
    
    switch (log.endpoint) {
      case "/api/api-keys":
        return "bg-primary/10";
      case "/api/integrations":
        return "bg-secondary/10";
      default:
        return "bg-secondary/10";
    }
  };

  if (logs.length === 0) {
    return (
      <Card data-testid="activity-feed">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground">No recent activity</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="activity-feed">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {logs.slice(0, 5).map((log) => (
            <div key={log.id} className="flex items-start space-x-3" data-testid={`activity-item-${log.id}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getIconBgClass(log)}`}>
                {getActivityIcon(log)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground" data-testid={`activity-message-${log.id}`}>
                  {getActivityMessage(log)}
                </p>
                <p className="text-xs text-muted-foreground" data-testid={`activity-description-${log.id}`}>
                  {getActivityDescription(log)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
