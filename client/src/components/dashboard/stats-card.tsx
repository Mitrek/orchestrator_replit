import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  iconBgColor?: string;
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  change,
  changeType = "neutral",
  iconBgColor = "bg-primary/10 text-primary",
}: StatsCardProps) {
  const changeColorMap = {
    positive: "text-secondary bg-secondary/10",
    negative: "text-accent bg-accent/10",
    neutral: "text-muted-foreground bg-muted",
  };

  return (
    <Card className="hover-lift animate-fade-in" data-testid={`stats-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBgColor}`}>
            <Icon className="w-5 h-5" />
          </div>
          {change && (
            <span 
              className={`text-xs font-medium px-2 py-1 rounded-full ${changeColorMap[changeType]}`}
              data-testid={`stats-change-${title.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {change}
            </span>
          )}
        </div>
        <h3 
          className="text-2xl font-semibold text-foreground mb-1"
          data-testid={`stats-value-${title.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {value}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
