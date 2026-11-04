# Lights Inventory - Developer Guide

This guide helps developers understand the codebase architecture, development workflow, and common tasks.

## Agentic Workflow

This repository is configured for **fully agentic control**. When you ask the AI agent to make changes, it will automatically handle the entire development lifecycle:

### Agentic Development Process

**1. Branch Creation**
- Create a descriptive feature branch from main
- Branch naming: `feature/description` or `fix/description`
- Example: `feature/add-user-dashboard` or `fix-auth-bug`

**2. Development & Testing**
- Make changes on the feature branch
- Run type checking: `pnpm typecheck`
- Run linting: `pnpm lint`
- Run tests: `pnpm test`
- Build locally: `pnpm build`
- Deploy Convex locally for testing: `npx convex dev --once`

**3. Pull Request Creation**
- Push branch to remote
- Create PR using GitHub CLI with detailed description
- Include test plan and checklist
- Link related issues

**4. Check Monitoring**
- Monitor GitHub Actions status checks
- Monitor Vercel deployment status (both lights-inventory and lights-inventory-4.6)
- Monitor Convex deployment status
- Wait for all checks to pass before proceeding

**5. Deployment Verification**
- Verify Vercel deployments complete successfully
- Verify Convex deployment completes successfully
- Check production URL is accessible
- Verify functionality in production if applicable

**6. Merge Process**
- Only merge when explicitly instructed by user
- Merge PR using GitHub CLI
- Delete feature branch after merge
- Verify main branch is updated

**7. Post-Merge Verification**
- Monitor final deployment status
- Verify all systems are operational
- Report final status to user

### Required Status Checks

**Before merging, ensure all checks pass:**
- ✅ Vercel – lights-inventory: Deployment has completed
- ✅ Vercel – lights-inventory-4.6: Deployment has completed
- ✅ Convex Deploy: Typecheck, tests, and deployment all pass
- ✅ Code Quality: Linting and type checking pass

### Deployment Platforms

**Vercel (Frontend):**
- Main project: `lights-inventory` (https://lights-inventory.vercel.app)
- Preview project: `lights-inventory-4.6`
- Both deploy on push to main
- Monitor via GitHub status checks

**Convex (Backend):**
- Production deployment: https://zealous-elephant-547.convex.cloud
- Deploys via GitHub Actions on push to main (when convex/** changes)
- Can also deploy manually: `npx convex deploy --yes`
- Monitor via GitHub Actions workflow

### Agentic Commands Reference

```bash
# Create feature branch
git checkout -b feature/description

# Push and create PR
git push -u origin feature/description
gh pr create --title "Title" --body "Description"

# Monitor status checks
gh api repos/TomHart/lights-inventory/commits/HEAD/status

# Monitor Vercel deployments
gh run list --workflow=convex-deploy.yml

# Merge PR (only when instructed)
gh pr merge --merge

# Delete branch after merge
git branch -d feature/description
git push origin --delete feature/description

# Deploy Convex manually
npx convex deploy --yes
```

### Repository Rules

This repository has the following branch protection rules:
- **main branch is protected** - requires PR for changes
- **Required status checks**: test must pass
- **Changes must be made through pull request**
- **Bypass rules**: May be bypassed for direct commits (used by agent for documentation updates)

### Monitoring Commands

```bash
# Check GitHub Actions workflows
gh workflow list

# Check recent workflow runs
gh run list --limit 5

# Check specific workflow run
gh run view <run-id>

# Check commit status
gh api repos/TomHart/lights-inventory/commits/main/status

# List branches
gh api repos/TomHart/lights-inventory/branches

# Delete remote branch
git push origin --delete branch-name
```

### Agent Responsibilities

When asked to make changes, the agent will:
1. ✅ Create appropriate feature branch
2. ✅ Make changes and run all local checks
3. ✅ Push and create PR with detailed description
4. ✅ Monitor all status checks until complete
5. ✅ Verify both Vercel and Convex deployments
6. ✅ Report status and wait for merge approval
7. ✅ Merge when explicitly instructed
8. ✅ Clean up branches after merge
9. ✅ Verify final deployment status

The agent will **NOT** merge without explicit user approval, even if all checks pass.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development servers (Convex + Vite)
pnpm dev

# Run type checking
pnpm typecheck

# Run linting
pnpm lint

# Run tests
pnpm test

# Build for production
pnpm build
```

## Project Overview

Lights Inventory is a full-stack web application for managing light fixtures and bulbs across multiple properties. It uses:

- **Frontend**: TanStack Start (React 19 + file-based routing) with Vite
- **Backend**: Convex (serverless backend-as-a-service with real-time sync)
- **Styling**: Tailwind CSS 4 with shadcn/ui components
- **Auth**: Convex Auth with email verification and reCAPTCHA Enterprise
- **Deployment**: Vercel (frontend) + Convex (backend)

### Tech Stack

| Category | Technology | Version |
|----------|------------|---------|
| Runtime | Node.js | 20 |
| Language | TypeScript | 5.7.2 |
| Framework | TanStack Start | 1.168.60 |
| UI Library | React | 19.2.0 |
| Styling | Tailwind CSS | 4.1.18 |
| Backend | Convex | 1.34.0 |
| Build Tool | Vite | 7.3.1 |
| Package Manager | pnpm | 10.x |
| Testing | Vitest | 3.0.5 |
| Linting | Biome | 2.4.10 |

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Vercel (Frontend)                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Web Application (TanStack Start + React 19)          │  │
│  │  - File-based routing in src/routes/                 │  │
│  │  - Client components in src/components/              │  │
│  │  - Convex integration in src/integrations/convex/    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                    WebSocket + HTTPS API
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Convex (Backend)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Auth Service (Convex Auth + Email Verification)     │  │
│  │  - Password-based auth with email verification      │  │
│  │  - reCAPTCHA Enterprise integration                  │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Database (PostgreSQL + Real-time Sync)              │  │
│  │  - Schema defined in convex/schema.ts                │  │
│  │  - Queries in convex/*.ts files                     │  │
│  │  - Mutations in convex/*.ts files                   │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Rate Limiter (Token Bucket Algorithm)               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
lights-inventory-4.6/
├── convex/                 # Convex backend code
│   ├── schema.ts          # Database schema definitions
│   ├── auth.ts            # Authentication configuration
│   ├── auth.config.ts     # Auth provider config
│   ├── auth.helpers.ts    # Auth utility functions
│   ├── properties.ts      # Property CRUD operations
│   ├── rooms.ts           # Room CRUD operations
│   ├── fixtures.ts        # Fixture CRUD operations
│   ├── bulbs.ts           # Bulb CRUD operations
│   ├── inventory.ts       # Spare bulb inventory operations
│   ├── search.ts          # Search and analytics
│   ├── maintenance.ts     # Maintenance logs
│   ├── reminders.ts       # Reminder management
│   ├── dataTransfer.ts    # Import/export functionality
│   ├── migrations.ts     # Data migrations
│   ├── rateLimit.ts       # Rate limiting implementation
│   ├── recaptcha.ts       # reCAPTCHA Enterprise integration
│   └── validation.ts     # Input validation helpers
├── src/
│   ├── routes/            # TanStack file-based routes
│   │   ├── __root.tsx     # Root layout and providers
│   │   ├── index.tsx      # Dashboard
│   │   ├── login.tsx      # Authentication
│   │   ├── verify.tsx     # Email verification
│   │   ├── properties.tsx # Properties list
│   │   ├── property.$propertyId.tsx
│   │   ├── room.$roomId.tsx
│   │   ├── fixture.$fixtureId.tsx
│   │   ├── inventory.tsx  # Spare bulbs
│   │   └── search.tsx     # Search functionality
│   ├── components/        # Reusable UI components
│   │   ├── ui/            # shadcn/ui components
│   │   ├── AuthGuard.tsx  # Authentication wrapper
│   │   ├── Header.tsx     # App header
│   │   └── ConfirmDialog.tsx
│   ├── integrations/      # Third-party integrations
│   │   └── convex/
│   │       └── provider.tsx # Convex React provider
│   ├── lib/               # Utility functions
│   │   └── constants.ts   # Shared constants
│   ├── router.tsx         # TanStack Router config
│   └── styles.css         # Global styles
├── public/                # Static assets
├── vercel.json           # Vercel deployment config
├── vite.config.ts         # Vite configuration
├── biome.json            # Biome linting config
├── tsconfig.json         # TypeScript config
└── package.json          # Dependencies and scripts
```

## Key Concepts

### Convex Backend

Convex is a backend-as-a-service that provides:
- **Real-time database**: PostgreSQL with automatic WebSocket sync
- **Type-safe API**: Auto-generated TypeScript types from schema
- **Server functions**: Queries (reads) and Mutations (writes) run on the server
- **Authentication**: Built-in auth providers (we use password + email)
- **File storage**: For future use (not currently used)

#### Schema Definition

Database schema is defined in `convex/schema.ts` using Convex's schema builder:

```typescript
export default defineSchema({
  ...authTables, // Built-in auth tables
  
  properties: defineTable({
    userId: v.id("users"),
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
  
  // ... other tables
});
```

#### Queries vs Mutations

- **Queries**: Read-only operations, run on server, return data
  ```typescript
  export const list = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
      return await ctx.db
        .query("properties")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .collect();
    },
  });
  ```

- **Mutations**: Write operations, run on server, can modify database
  ```typescript
  export const create = mutation({
    args: { name: v.string() },
    handler: async (ctx, args) => {
      return await ctx.db.insert("properties", {
        name: args.name,
        userId: await getVerifiedUserId(ctx),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    },
  });
  ```

#### Using Convex in React

```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

// Read data
const properties = useQuery(api.properties.list);
const property = useQuery(api.properties.get, { id: propertyId });

// Write data
const createProperty = useMutation(api.properties.create);
await createProperty({ name: "My Property" });
```

### TanStack Start Routing

TanStack Start provides file-based routing with:
- **Route files**: `src/routes/$path.tsx` define routes
- **Loaders**: Data fetching before render
- **Server functions**: Server-side code execution

#### Route Structure

```typescript
// src/routes/property.$propertyId.tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/property/$propertyId")({
  component: PropertyDetailPage,
  loader: async ({ params }) => {
    // Fetch data before render
    return await fetchProperty(params.propertyId);
  },
});

function PropertyDetailPage() {
  const { propertyId } = Route.useParams();
  const property = Route.useLoaderData();
  // ...
}
```

#### Navigation

```typescript
import { Link, useNavigate } from "@tanstack/react-router";

// Link component
<Link to="/property/$propertyId" params={{ propertyId: "123" }}>
  View Property
</Link>

// Programmatic navigation
const navigate = useNavigate();
navigate({ to: "/property/$propertyId", params: { propertyId: "123" }});
```

### Authentication Flow

1. **User enters email/password** on `/login`
2. **reCAPTCHA Enterprise** validates user is human
3. **Convex Auth** checks credentials
4. **Email verification** code sent via Mailgun
5. **User enters code** on `/verify`
6. **Account activated** and user redirected to dashboard

Authentication state is managed by Convex and accessed via:

```typescript
import { useConvexAuth, useAuthActions } from "@convex-dev/auth/react";

const { isAuthenticated, isLoading } = useConvexAuth();
const { signIn, signOut } = useAuthActions();
```

### Type Safety

All Convex functions are fully typed. Types are auto-generated in `convex/_generated/`:

- `api.d.ts` - All query and mutation functions
- `dataModel.d.ts` - Database schema types
- `server.d.ts` - Server-side types

Use these imports for type safety:

```typescript
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";

const property: Doc<"properties"> = ...;
const propertyId: Id<"properties"> = "abc123";
```

## Common Tasks

### Adding a New Database Table

1. Define schema in `convex/schema.ts`:
   ```typescript
   export default defineSchema({
     ...authTables,
     
     myTable: defineTable({
       userId: v.id("users"),
       name: v.string(),
       // ... other fields
     }).index("by_userId", ["userId"]),
   });
   ```

2. Create queries and mutations in `convex/myTable.ts`:
   ```typescript
   export const list = query({
     args: { userId: v.id("users") },
     handler: async (ctx, args) => {
       return await ctx.db
         .query("myTable")
         .withIndex("by_userId", (q) => q.eq("userId", args.userId))
         .collect();
     },
   });
   ```

3. Use in React component:
   ```typescript
   const items = useQuery(api.myTable.list, { userId: currentUser._id });
   ```

### Adding a New Route

1. Create file in `src/routes/`:
   ```bash
   touch src/routes/my-page.tsx
   ```

2. Define route:
   ```typescript
   import { createFileRoute } from "@tanstack/react-router";

   export const Route = createFileRoute("/my-page")({
     component: MyPage,
   });

   function MyPage() {
     return <div>My Page</div>;
   }
   ```

3. Add link from other pages:
   ```typescript
   <Link to="/my-page">Go to My Page</Link>
   ```

### Adding a New shadcn/ui Component

```bash
pnpm dlx shadcn@latest add button
```

This adds the component to `src/components/ui/` and updates necessary config files.

### Running Migrations

Migrations are one-time data transformations. To run a migration:

```bash
npx convex run migrations:backfillSocketTypeAndFeatures
```

Migrations are defined in `convex/migrations.ts` and should include user isolation checks:

```typescript
export const myMigration = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getVerifiedUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    // Migration logic here
  },
});
```

### Importing/Exporting Data

The application supports JSON import/export for backup and migration:

```typescript
// Export
const exportData = useMutation(api.dataTransfer.export);
await exportData();

// Import
const importData = useMutation(api.dataTransfer.import);
await importData({ data: jsonString });
```

Import format:
```json
{
  "properties": [
    {
      "name": "My Property",
      "rooms": [
        {
          "name": "Living Room",
          "roomType": "living_room",
          "fixtures": [
            {
              "name": "Ceiling Light",
              "location": "ceiling",
              "bulbs": [
                {
                  "socketType": "E26",
                  "wattage": 60,
                  "colourTemperature": "warm",
                  "status": "working",
                  "installDate": 1234567890000
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "spareBulbs": [
    {
      "socketType": "E26",
      "wattage": 60,
      "colourTemperature": "warm",
      "quantity": 5
    }
  ]
}
```

## Testing

### Running Tests

```bash
pnpm test
```

Tests are located alongside source files and use Vitest with React Testing Library.

### Test Structure

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MyComponent } from "./MyComponent";

describe("MyComponent", () => {
  it("renders correctly", () => {
    render(<MyComponent />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
```

## Deployment

### Frontend (Vercel)

The frontend is automatically deployed to Vercel on push to main:

1. Connect repository to Vercel
2. Set environment variables in Vercel dashboard:
   - `VITE_CONVEX_URL`: Convex deployment URL
   - `VITE_RECAPTCHA_SITE_KEY`: reCAPTCHA site key
3. Push to main branch triggers automatic deployment

### Backend (Convex)

Convex is deployed via GitHub Actions (`.github/workflows/convex-deploy.yml`):

1. Set `CONVEX_DEPLOY_KEY` in GitHub secrets
2. Set `CONVEX_DEPLOYMENT_PROD` in GitHub variables
3. Push to main triggers automatic Convex deployment

### Environment Variables

**Local Development (.env.local):**
```
CONVEX_DEPLOYMENT=dev:your-deployment-name
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_RECAPTCHA_SITE_KEY=your-site-key
```

**Production (Vercel):**
```
VITE_CONVEX_URL=https://prod-deployment.convex.cloud
VITE_RECAPTCHA_SITE_KEY=prod-site-key
```

**Convex Production:**
```
RECAPTCHA_PROJECT_ID=your-project-id
RECAPTCHA_API_KEY=your-api-key
RECAPTCHA_SITE_KEY=your-site-key
RECAPTCHA_SECRET=your-secret-key
MAILGUN_SECRET=your-mailgun-key
```

## Troubleshooting

### Common Issues

**Convex connection errors:**
- Ensure `VITE_CONVEX_URL` is set correctly
- Check Convex deployment is running: `npx convex dev`
- Verify Convex deployment URL matches environment variable

**Type errors after schema changes:**
- Run `npx convex dev` to regenerate types
- Restart TypeScript server in your IDE

**Build failures:**
- Clear `.output/` directory: `rm -rf .output/`
- Reinstall dependencies: `rm -rf node_modules && pnpm install`
- Check TypeScript errors: `pnpm typecheck`

**reCAPTCHA errors:**
- Verify API keys are correct in Convex environment
- Check reCAPTCHA project is active in Google Cloud Console
- Ensure site key matches deployment environment

**Linting errors:**
- Run `pnpm lint:fix` to auto-fix Biome issues
- Check `biome.json` for configured rules

### Debugging

**Enable Convex dashboard:**
```bash
npx convex dev
```
Visit the URL shown in the terminal to view the Convex dashboard.

**Check Convex function logs:**
Logs are available in the Convex dashboard for both dev and production.

**Debug reCAPTCHA:**
Check console for reCAPTCHA errors. In development, reCAPTCHA can be skipped if not configured.

## Performance Considerations

### Database Queries

- Use indexes for frequently queried fields (see `convex/schema.ts`)
- Avoid N+1 queries by using Convex's relationship patterns
- Use pagination for large datasets

### Frontend Optimization

- TanStack Router loaders fetch data in parallel
- React Query caches query results automatically
- Vite provides fast HMR during development

### Rate Limiting

Rate limiting is implemented for sensitive operations:
- Authentication: 20 attempts per 10 minutes
- Global: 300 requests per 10 minutes
- Configured in `convex/rateLimit.ts`

## Security

### Authentication

- Email verification required for all new accounts
- Passwords hashed by Convex Auth
- Session management handled by Convex

### Bot Protection

- Google reCAPTCHA Enterprise on authentication
- reCAPTCHA score threshold: 0.5
- Configured in `convex/recaptcha.ts`

### Data Isolation

- All queries filtered by `userId`
- User can only access their own data
- Verified in all Convex functions via `getVerifiedUserId()`

### Security Headers

Configured in `vercel.json`:
- Content Security Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security: 2 years

## Contributing

### Code Style

- Use TypeScript strict mode
- Follow Biome linting rules
- Prefer functional components with hooks
- Use Tailwind CSS for styling

### Commit Messages

Follow conventional commits:
```
feat: add new feature
fix: fix bug
docs: update documentation
refactor: code refactoring
test: add tests
chore: maintenance
```

### Pull Request Process

1. Create branch from main
2. Make changes with clear commit messages
3. Run `pnpm typecheck` and `pnpm lint`
4. Push branch and create PR
5. Ensure CI checks pass
6. Request review

## Resources

- [TanStack Start Documentation](https://tanstack.com/start)
- [Convex Documentation](https://docs.convex.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com)
- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Biome Documentation](https://biomejs.dev)
