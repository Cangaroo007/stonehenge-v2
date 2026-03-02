# CLAUDE.md — Stone Henge Project Instructions

This file is read automatically by Claude Code at the start of every session.
Follow every instruction in this file before doing anything else.

## Step 1 — Session Startup (Run First, Every Time)

Run this before anything else:

    cd ~/Downloads/stonehenge-v2
    source scripts/db-connect.sh
    psql "$DATABASE_URL" -c "SELECT NOW();" && echo "DB connected" || echo "DB FAILED — stop and report"

If DB FAILED: stop immediately. Do not proceed. Do not infer answers from code alone.

## Step 2 — Read the Rulebook

    cat docs/stonehenge-dev-rulebook.md

Read the rulebook before writing any code. No exceptions.

## Project Identity

- Project: Stone Henge — AI quote automation for stone benchtop fabrication
- Client: Northcoast Stone Pty Ltd, Queensland, Australia
- Local path: ~/Downloads/stonehenge-v2
- Tech stack: Next.js 14, TypeScript strict, PostgreSQL, Prisma ORM
- Deployment: Railway Pro — auto-deploys from main branch

## Critical Rules

- Never push directly to main — always use feature branches and PRs
- Use Array.from(new Set()) — never spread a Set
- Prisma JSON fields — always double cast as unknown as Type
- Next.js 14 route params — always await params
- Run npm run build and npx tsc --noEmit before every commit
- Write stop gate phrase and wait for human approval before any push

## Database Rules

- scripts/db-connect.sh contains DATABASE_URL — never commit this file
- .env contains DATABASE_URL — never commit this file
- Both are in .gitignore
- SELECT queries are fine in any session
- No INSERT, UPDATE, or DELETE without showing SQL to human and getting explicit approval

## Local Path

Always: ~/Downloads/stonehenge-v2
Never: ~/stonehenge or ~/stonehenge-v2
