import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

let convex: ConvexReactClient | undefined;

function getClient() {
  const url = import.meta.env.VITE_CONVEX_URL;
  if (!url)
    throw new Error(
      "Missing VITE_CONVEX_URL. Set it in .env.local or the Vercel environment settings and rebuild.",
    );
  convex ??= new ConvexReactClient(url);
  return convex;
}

export default function AppConvexProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConvexAuthProvider client={getClient()}>{children}</ConvexAuthProvider>
  );
}
