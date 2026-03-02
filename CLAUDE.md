# CLAUDE.md

## Run this first — every session, no exceptions
```bash
cd ~/Downloads/stonehenge-v2
cat docs/stonehenge-dev-rulebook.md
```

## Database Queries — How This Works

Claude Code cannot reach the Railway database directly (sandbox blocks outbound connections).

For any query that requires DB data:
1. Claude Code writes the exact SQL
2. Sean runs it in his local terminal:
   `psql "postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway" -c "YOUR SQL HERE"`
3. Sean pastes the results back into Claude Code
4. Claude Code proceeds based on actual output only — never infers or assumes

## All project rules and state live in:
- `docs/stonehenge-dev-rulebook.md` — 65 rules, all non-negotiable
- `docs/SYSTEM_STATE.md` — living codebase snapshot
- `docs/AUDIT_TRACKER.md` — all known open issues
