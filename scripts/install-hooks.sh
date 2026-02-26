#!/bin/sh
set -e

if [ ! -d ".git" ]; then
  echo "Skipping hook installation (no .git directory)"
  exit 0
fi

HOOKS_DIR=".git/hooks"
SCRIPTS_DIR="scripts/hooks"

echo "Installing Stone Henge git hooks..."
cp "$SCRIPTS_DIR/pre-push" "$HOOKS_DIR/pre-push"
chmod +x "$HOOKS_DIR/pre-push"

echo "✅ pre-push hook installed"
