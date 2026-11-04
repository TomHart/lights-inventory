#!/bin/bash
# Safety check script for agents to run before pushing
# This ensures the repository is in a good state

set -e

echo "🔒 Running safety checks before push..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: Typecheck
echo "📝 Check 1: TypeScript typecheck..."
if pnpm typecheck; then
  echo -e "${GREEN}✅ Typecheck passed${NC}"
else
  echo -e "${RED}❌ Typecheck failed${NC}"
  echo "Please fix TypeScript errors before pushing."
  exit 1
fi
echo ""

# Check 2: Lint
echo "🔍 Check 2: Linting..."
if pnpm lint; then
  echo -e "${GREEN}✅ Linting passed${NC}"
else
  echo -e "${YELLOW}⚠️  Linting has warnings (but no errors)${NC}"
  echo "Consider fixing warnings, but continuing..."
fi
echo ""

# Check 3: Tests
echo "🧪 Check 3: Tests..."
if pnpm test; then
  echo -e "${GREEN}✅ Tests passed${NC}"
else
  echo -e "${RED}❌ Tests failed${NC}"
  echo "Please fix failing tests before pushing."
  exit 1
fi
echo ""

# Check 4: Build
echo "🏗️  Check 4: Build..."
if pnpm build; then
  echo -e "${GREEN}✅ Build passed${NC}"
else
  echo -e "${RED}❌ Build failed${NC}"
  echo "Please fix build errors before pushing."
  exit 1
fi
echo ""

# Check 5: No uncommitted changes
echo "📋 Check 5: No uncommitted changes..."
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${YELLOW}⚠️  You have uncommitted changes${NC}"
  echo "Current status:"
  git status --short
  echo ""
  read -p "Do you want to commit these changes first? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Please commit your changes before pushing."
    exit 1
  fi
else
  echo -e "${GREEN}✅ No uncommitted changes${NC}"
fi
echo ""

# Check 6: Branch is up to date
echo "📡 Check 6: Branch is up to date with remote..."
if git fetch; then
  LOCAL=$(git rev-parse @)
  REMOTE=$(git rev-parse @{u})
  BASE=$(git merge-base @ @{u})
  if [ $LOCAL = $REMOTE ]; then
    echo -e "${GREEN}✅ Branch is up to date${NC}"
  elif [ $LOCAL = $BASE ]; then
    echo -e "${YELLOW}⚠️  Branch is behind remote${NC}"
    echo "Please pull changes before pushing."
    exit 1
  else
    echo -e "${YELLOW}⚠️  Branch has diverged from remote${NC}"
    echo "Please resolve this before pushing."
    exit 1
  fi
fi
echo ""

echo -e "${GREEN}🎉 All safety checks passed!${NC}"
echo "You may proceed with pushing."
