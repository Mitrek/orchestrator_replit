import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Book,
  Clock,
  Cog,
  FileText,
  History,
  Key,
  LayoutDashboard,
  Play,
  Plug,
  TrendingUp,
  Users,
  AlertTriangle,
} from "lucide-react";

interface SidebarProps {
  className?: string;
}

const navigationItems = [
  {
    title: "API Management",
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "API Keys", href: "/api-keys", icon: Key },
      { name: "Integrations", href: "/integrations", icon: Plug },
      { name: "Request Logs", href: "/logs", icon: History },
    ],
  },
  {
    title: "Analytics",
    items: [
      { name: "Usage Stats", href: "/analytics", icon: BarChart3 },
      { name: "Error Rates", href: "/analytics/errors", icon: AlertTriangle },
      { name: "Performance", href: "/analytics/performance", icon: Clock },
    ],
  },
  {
    title: "Documentation",
    items: [
      { name: "API Reference", href: "/docs", icon: Book },
      { name: "Quick Start", href: "/docs/quickstart", icon: Play },
      { name: "Code Examples", href: "/docs/examples", icon: FileText },
    ],
  },
  {
    title: "Administration",
    items: [
      { name: "User Management", href: "/admin/users", icon: Users },
      { name: "Settings", href: "/settings", icon: Cog },
    ],
  },
];

export function Sidebar({ className }: SidebarProps) {
  const [location] = useLocation();

  return (
    <aside 
      className={cn("w-64 bg-card border-r border-border hidden lg:block", className)}
      data-testid="sidebar"
    >
      <nav className="p-4 space-y-2">
        {navigationItems.map((section) => (
          <div key={section.title} className="mb-6">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {section.title}
            </h3>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = location === item.href;
                const Icon = item.icon;
                
                return (
                  <li key={item.name}>
                    <Link 
                      href={item.href}
                      className={cn(
                        "flex items-center space-x-3 px-3 py-2 rounded-md transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                      data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
