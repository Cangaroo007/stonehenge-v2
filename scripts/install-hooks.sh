#!/bin/sh
# Installs git hooks for Stone Henge development
set -e

HOOKS_DIR=".git/hooks"
SCRIPTS_DIR="scripts/hooks"

echo "Installing Stone Henge git hooks..."

# pre-push
cp "$SCRIPTS_DIR/pre-push" "$HOOKS_DIR/pre-push"
chmod +x "$HOOKS_DIR/pre-push"

echo "✅ pre-push hook installed"
echo "   Enforces AUDIT_TRACKER.md update on fix/* and feat/* branches"
