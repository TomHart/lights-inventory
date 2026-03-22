import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

function DefaultPending() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}

function DefaultError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'An unexpected error occurred'
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <div className="mx-auto max-w-md rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
        <h2 className="mb-2 text-lg font-semibold text-destructive">Something went wrong</h2>
        <p className="mb-4 text-sm text-muted-foreground">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Reload page
        </button>
      </div>
    </div>
  )
}

function DefaultNotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <div className="text-center">
        <h2 className="mb-2 text-4xl font-bold text-muted-foreground">404</h2>
        <p className="mb-4 text-lg text-muted-foreground">Page not found</p>
        <a
          href="/dashboard"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  )
}

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,

    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: DefaultPending,
    defaultErrorComponent: DefaultError,
    defaultNotFoundComponent: DefaultNotFound,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
