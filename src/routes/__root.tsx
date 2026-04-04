import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { Analytics } from "@vercel/analytics/react";
import Header from "../components/Header";
import ConvexProvider from "../integrations/convex/provider";
import { Toaster } from "#/components/ui/sonner";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lights Inventory" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="/theme-init.js" />
        <HeadContent />
      </head>
      <body className="font-sans antialiased min-h-screen bg-background text-foreground">
        <ConvexProvider>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <footer className="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Lights Inventory &mdash; Manage your lighting with ease
            </footer>
          </div>
          <Toaster />
          <TanStackDevtools
            config={{ position: "bottom-right" }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        </ConvexProvider>
        <Analytics />
        <Scripts />
      </body>
    </html>
  );
}
