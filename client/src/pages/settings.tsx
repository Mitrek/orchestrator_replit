
import { Layout } from "@/components/layout/layout";
import { ComingSoon } from "@/components/ui/coming-soon";
import { User } from "@shared/schema";
import { Cog } from "lucide-react";

export default function Settings({ user }: { user: User | null }) {
  return (
    <Layout user={user}>
      <ComingSoon 
        title="Coming Soon"
        description="Settings and configuration options are currently being developed and will be available soon."
        icon={Cog}
      />
    </Layout>
  );
}
