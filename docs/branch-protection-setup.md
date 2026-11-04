# Branch Protection Configuration

To implement branch protection rules for the main branch, run the following command:

```bash
gh api repos/TomHart/lights-inventory/branches/main/protection \
  -X PUT \
  -f required_status_checks='{"strict":true,"contexts":["test","Typecheck"]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true,"require_code_owner_reviews":false}' \
  -f restrictions='{"users":["TomHart"],"teams":[]}' \
  -f allow_force_pushes=false \
  -f allow_deletions=false
```

## Current Protection Settings

As of this implementation, branch protection is not yet configured. The command above will:

- Require pull request before merging to main
- Require "test" status check to pass
- Require "Typecheck" status check to pass
- Enforce status checks strictly
- Require 1 approving review
- Dismiss stale PR reviews
- Restrict who can push to main (only TomHart)
- Disallow force pushes
- Disallow branch deletion

## Alternative: Configure via GitHub UI

1. Go to https://github.com/TomHart/lights-inventory/settings/branches
2. Click "Add rule" for main branch
3. Configure:
   - Require pull request before merging: ✓
   - Require approvals: 1
   - Dismiss stale reviews: ✓
   - Require status checks to pass: ✓
   - Require branches to be up to date: ✓
   - Restrict who can push: TomHart
