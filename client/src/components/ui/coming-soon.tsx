
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export function ComingSoon({ 
  title, 
  description = "This feature is currently under development and will be available soon.",
  icon: Icon = Clock,
  className = ""
}: ComingSoonProps) {
  return (
    <div className={`flex items-center justify-center min-h-[400px] ${className}`}>
      <Card className="w-full max-w-md mx-auto text-center">
        <CardHeader>
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon className="w-8 h-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed">
            {description}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
