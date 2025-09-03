
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User } from "@shared/schema";
import { Book } from "lucide-react";

export default function Documentation({ user }: { user: User | null }) {
  return (
    <Layout user={user}>
      <div className="space-y-8" data-testid="documentation">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              Documentation
            </h2>
            <p className="text-muted-foreground">
              API reference, guides, and tutorials
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Book className="w-5 h-5" />
              <span>API Documentation</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <Book className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Coming Soon</h3>
              <p className="text-muted-foreground">
                Comprehensive documentation is on the way.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
