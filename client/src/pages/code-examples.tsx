
import { Layout } from "@/components/layout/layout";
import { ComingSoon } from "@/components/ui/coming-soon";
import { User } from "@shared/schema";
import { FileText } from "lucide-react";

export default function CodeExamples({ user }: { user: User | null }) {
  return (
    <Layout user={user}>
      <ComingSoon 
        title="Coming Soon"
        description="Code examples and implementation guides are currently being prepared and will be available soon."
        icon={FileText}
      />
    </Layout>
  );
}
