import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, RotateCcw, Key } from "lucide-react";
import { ApiKey } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface ApiKeyCardProps {
  apiKey: ApiKey;
  onRegenerate?: (id: string) => void;
  usageCount?: number | string;
  usagePercentage?: number | string;
  fullKey?: string; // Optional full key (only available right after creation)
}

export function ApiKeyCard({ 
  apiKey, 
  onRegenerate, 
  usageCount = 0, 
  usagePercentage = 0,
  fullKey
}: ApiKeyCardProps) {
  const { toast } = useToast();

  const handleCopy = () => {
    if (fullKey) {
      navigator.clipboard.writeText(fullKey);
      toast({
        title: "Full API Key Copied",
        description: "The complete API key has been copied to your clipboard.",
        variant: "default",
      });
    } else {
      const maskedKey = `${apiKey.keyPrefix}••••••••••••••••••••••••••••`;
      navigator.clipboard.writeText(maskedKey);
      toast({
        title: "Masked Key Copied",
        description: "Only the masked prefix is available. Full keys are only shown during creation.",
        variant: "default",
      });
    }
  };

  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate(apiKey.id);
    }
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive ? "bg-secondary/10 text-secondary" : "bg-muted text-muted-foreground";
  };

  const getIconColor = (isActive: boolean) => {
    return isActive ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent";
  };

  return (
    <Card className="hover:bg-muted/50 transition-colors" data-testid={`api-key-card-${apiKey.name.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getIconColor(apiKey.isActive)}`}>
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-medium text-foreground" data-testid={`api-key-name-${apiKey.id}`}>
                {apiKey.name}
              </h4>
              <p className="text-sm text-muted-foreground">
                Created {new Date(apiKey.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <Badge 
            className={getStatusColor(apiKey.isActive)}
            data-testid={`api-key-status-${apiKey.id}`}
          >
            {apiKey.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
        
        <div className="flex items-center space-x-2 mb-3">
          <code 
            className="flex-1 px-3 py-2 bg-muted rounded font-mono text-sm text-muted-foreground"
            data-testid={`api-key-value-${apiKey.id}`}
          >
            {fullKey || `${apiKey.keyPrefix}••••••••••••••••••••••••••••`}
          </code>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleCopy}
            data-testid={`copy-api-key-${apiKey.id}`}
            title="Copy API Key"
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleRegenerate}
            data-testid={`regenerate-api-key-${apiKey.id}`}
            title="Regenerate Key"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Rate limit: {apiKey.rateLimit?.toLocaleString() || 1000} req/hour
          </span>
          <span className="text-muted-foreground" data-testid={`api-key-usage-${apiKey.id}`}>
            Used: {usageCount} ({typeof usagePercentage === 'number' ? usagePercentage.toFixed(1) + '%' : usagePercentage})
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
