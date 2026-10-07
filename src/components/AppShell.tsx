import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Kanban,
  LayoutDashboard,
  LogOut,
  Plus,
  Upload,
  Link2,
  DollarSign,
  ListChecks,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: ReactNode;
  onNewLead?: () => void;
  primaryAction?: { label: string; onClick: () => void };
  onImportCsv?: () => void;
  selectMode?: boolean;
  onToggleSelect?: () => void;
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

export function AppShell({
  children,
  onNewLead,
  primaryAction,
  onImportCsv,
  selectMode,
  onToggleSelect,
}: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ready = useRequireAuth();

  const action = primaryAction ?? (onNewLead ? { label: "Novo Lead", onClick: onNewLead } : null);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:px-4">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground font-bold text-sm">
              C
            </div>
            <span className="font-semibold tracking-tight">Closefy</span>
          </div>
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            <Link to="/">
              <Button
                variant={pathname === "/" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <Kanban className="size-4" /> Kanban
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button
                variant={pathname === "/dashboard" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <LayoutDashboard className="size-4" /> Dashboard
              </Button>
            </Link>
            <Link to="/links">
              <Button
                variant={pathname === "/links" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <Link2 className="size-4" /> Links
              </Button>
            </Link>
            <Link to="/vendas">
              <Button
                variant={pathname === "/vendas" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <DollarSign className="size-4" /> Vendas
              </Button>
            </Link>
            <Link to="/conversas">
              <Button
                variant={pathname === "/conversas" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <MessageCircle className="size-4" /> Conversas
              </Button>
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {pathname === "/" && (
              <Button
                variant="ghost"
                size="sm"
                className="hidden gap-2 md:inline-flex"
                onClick={onImportCsv ?? (() => toast.info("Importação CSV em breve"))}
              >
                <Upload className="size-4" /> Importar CSV
              </Button>
            )}
            {pathname === "/" && onToggleSelect && (
              <Button
                variant={selectMode ? "secondary" : "ghost"}
                size="sm"
                className="hidden gap-2 md:inline-flex"
                onClick={onToggleSelect}
              >
                <ListChecks className="size-4" /> {selectMode ? "Cancelar seleção" : "Selecionar"}
              </Button>
            )}
            {action && (
              <Button
                size="sm"
                className="size-9 gap-2 px-0 sm:h-9 sm:w-auto sm:px-3"
                onClick={action.onClick}
                aria-label={action.label}
              >
                <Plus className="size-4" /> <span className="hidden sm:inline">{action.label}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="size-9 gap-2 px-0 text-muted-foreground sm:h-9 sm:w-auto sm:px-3"
              onClick={async () => {
                await supabase.auth.signOut();
              }}
            >
              <LogOut className="size-4" /> <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-3 py-3 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-4 md:py-4 md:pb-4">
        {children}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5 px-1">
          <MobileNavItem to="/" active={pathname === "/"} label="Kanban" icon={<Kanban />} />
          <MobileNavItem
            to="/dashboard"
            active={pathname === "/dashboard"}
            label="Dashboard"
            icon={<LayoutDashboard />}
          />
          <MobileNavItem
            to="/links"
            active={pathname === "/links"}
            label="Links"
            icon={<Link2 />}
          />
          <MobileNavItem
            to="/vendas"
            active={pathname === "/vendas"}
            label="Vendas"
            icon={<DollarSign />}
          />
          <MobileNavItem
            to="/conversas"
            active={pathname === "/conversas"}
            label="Conversas"
            icon={<MessageCircle />}
          />
        </div>
      </nav>
    </div>
  );
}

function MobileNavItem({
  to,
  active,
  label,
  icon,
}: {
  to: "/" | "/dashboard" | "/links" | "/vendas" | "/conversas";
  active: boolean;
  label: string;
  icon: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-medium transition-colors ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      <span className="[&>svg]:size-5">{icon}</span>
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}
