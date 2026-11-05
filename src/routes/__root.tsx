import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Analytics } from "@vercel/analytics/react";
import { Toaster } from "#/components/ui/sonner";
import Header from "../components/Header";
import ConvexProvider from "../integrations/convex/provider";

export const Route = createRootRoute({ component: RootDocument });

function RootDocument() {
  return (
    <ConvexProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <footer className="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Lights Inventory &mdash; Manage your lighting with ease
        </footer>
      </div>
      <Toaster />
      {import.meta.env.DEV && (
        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
      )}
      <Analytics />
    </ConvexProvider>
  );
}
