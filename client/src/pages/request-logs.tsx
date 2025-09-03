
import { Layout } from "@/components/layout/layout";
import { ComingSoon } from "@/components/ui/coming-soon";
import { User } from "@shared/schema";
import { History } from "lucide-react";

export default function RequestLogs({ user }: { user: User | null }) {
  return (
    <Layout user={user}>
      <ComingSoon 
        title="Coming Soon"
        description="Request logs and monitoring features are currently being developed and will be available soon."
        icon={History}
      />
    </Layout>
  );
}
