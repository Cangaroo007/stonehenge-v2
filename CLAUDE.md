# CLAUDE.md

## Run this first — every session, no exceptions
```bash
cd ~/Downloads/stonehenge-v2
export DATABASE_URL="postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway"
psql "$DATABASE_URL" -c "SELECT NOW();" && echo "DB connected" || echo "DB FAILED — stop and report"
cat docs/stonehenge-dev-rulebook.md
```

If DB FAILED: stop immediately. Do not proceed. Do not infer answers from code alone.

All project rules, codebase structure, and system state are in:
- `docs/stonehenge-dev-rulebook.md` — 65 rules, all non-negotiable
- `docs/SYSTEM_STATE.md` — living codebase snapshot
- `docs/AUDIT_TRACKER.md` — all known open issues
