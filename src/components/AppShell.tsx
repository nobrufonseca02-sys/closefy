import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Kanban, LayoutDashboard, LogOut, Plus, Upload, Link2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: ReactNode;
  onNewLead?: () => void;
  primaryAction?: { label: string; onClick: () => void };
  onImportCsv?: () => void;
}

/**
 * Every protected page renders through AppShell, so this is the single place
 * that gates access: no active Supabase session → redirect to /login instead
 * of rendering the page underneath. Direct client-side Supabase calls (see
 * leads-api.ts) rely entirely on RLS + a valid session for access control.
 */
function useRequireAuth() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        navigate({ to: "/login" });
      } else {
        setReady(true);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate({ to: "/login" });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  return ready;
}

export function AppShell({ children, onNewLead, primaryAction, onImportCsv }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ready = useRequireAuth();

  const action = primaryAction ?? (onNewLead ? { label: "Novo Lead", onClick: onNewLead } : null);

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground font-bold text-sm">C</div>
            <span className="font-semibold tracking-tight">Closefy</span>
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
                onClick={onImportCsv ?? (() => toast.info("Importação CSV em breve"))}
              >
                <Upload className="size-4" /> Importar CSV
              </Button>
            )}
            {action && (
              <Button size="sm" className="gap-2" onClick={action.onClick}>
                <Plus className="size-4" /> {action.label}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground"
              onClick={async () => {
                await supabase.auth.signOut();
              }}
            >
              <LogOut className="size-4" /> Sair
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-4">{children}</main>
    </div>
  );
}
