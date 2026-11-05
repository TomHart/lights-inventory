import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";

export const Route = createFileRoute("/_authed")({ component: AuthedLayout });

function AuthedLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading)
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}
