import { Link, useRouterState } from "@tanstack/react-router";
import { Kanban, LayoutDashboard, Plus, Upload, Link2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  onNewLead?: () => void;
  primaryAction?: { label: string; onClick: () => void };
}

export function AppShell({ children, onNewLead, primaryAction }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const action = primaryAction ?? (onNewLead ? { label: "Novo Lead", onClick: onNewLead } : null);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground font-bold text-sm">HT</div>
            <span className="font-semibold tracking-tight">HighTicket Closer</span>
          </div>
          <nav className="ml-4 flex items-center gap-1">
            <Link to="/">
              <Button variant={pathname === "/" ? "secondary" : "ghost"} size="sm" className="gap-2">
                <Kanban className="size-4" /> Kanban
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button variant={pathname === "/dashboard" ? "secondary" : "ghost"} size="sm" className="gap-2">
                <LayoutDashboard className="size-4" /> Dashboard
              </Button>
            </Link>
            <Link to="/links">
              <Button variant={pathname === "/links" ? "secondary" : "ghost"} size="sm" className="gap-2">
                <Link2 className="size-4" /> Links
              </Button>
            </Link>
            <Link to="/vendas">
              <Button variant={pathname === "/vendas" ? "secondary" : "ghost"} size="sm" className="gap-2">
                <DollarSign className="size-4" /> Vendas
              </Button>
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {pathname === "/" && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => toast.info("Importação CSV em breve")}
              >
                <Upload className="size-4" /> Importar CSV
              </Button>
            )}
            {action && (
              <Button size="sm" className="gap-2" onClick={action.onClick}>
                <Plus className="size-4" /> {action.label}
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-4">{children}</main>
    </div>
  );
}
