import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { User } from "@shared/schema";
// ✅ add this import
import { Toaster } from "@/components/ui/toaster";

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
}

export function Layout({ children, user }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Header user={user} />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8 overflow-auto" data-testid="main-content">
          {children}
        </main>
      </div>

      {/* ✅ mount once so toasts appear over dialogs */}
      <Toaster />
    </div>
  );
}
