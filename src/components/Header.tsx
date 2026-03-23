import { Link, useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import ThemeToggle from "./ThemeToggle";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "#/components/ui/button";
import {
  Lightbulb,
  Home,
  Search,
  Package,
  ClipboardList,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";

export default function Header() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-bold no-underline text-foreground"
        >
          <Lightbulb className="h-5 w-5 text-amber-500" />
          Lights Inventory
        </Link>

        {isAuthenticated && (
          <>
            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              <NavLinks />
            </div>
            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 text-muted-foreground"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </>
        )}

        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          {!isLoading && isAuthenticated && <SignOutButton />}
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && isAuthenticated && (
        <div className="md:hidden border-t border-border px-4 py-3 space-y-1 bg-background">
          <NavLinks mobile onNavigate={() => setMobileOpen(false)} />
          <div className="flex items-center gap-2 pt-2 border-t border-border mt-2">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      )}
    </header>
  );
}

function NavLinks({ mobile, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const linkClass = mobile
    ? "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent no-underline"
    : "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent no-underline";

  const activeClass = mobile
    ? "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-foreground bg-accent no-underline"
    : "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-foreground bg-accent no-underline";

  return (
    <>
      <Link
        to="/"
        className={linkClass}
        activeProps={{ className: activeClass }}
        activeOptions={{ exact: true }}
        onClick={onNavigate}
      >
        <Home className="h-4 w-4" /> Dashboard
      </Link>
      <Link
        to="/properties"
        className={linkClass}
        activeProps={{ className: activeClass }}
        onClick={onNavigate}
      >
        <ClipboardList className="h-4 w-4" /> Properties
      </Link>
      <Link
        to="/inventory"
        className={linkClass}
        activeProps={{ className: activeClass }}
        onClick={onNavigate}
      >
        <Package className="h-4 w-4" /> Inventory
      </Link>
      <Link
        to="/search"
        className={linkClass}
        activeProps={{ className: activeClass }}
        onClick={onNavigate}
      >
        <Search className="h-4 w-4" /> Search
      </Link>
    </>
  );
}

function SignOutButton() {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await signOut();
        navigate({ to: "/login" });
      }}
    >
      <LogOut className="h-4 w-4 mr-1" /> Sign Out
    </Button>
  );
}
