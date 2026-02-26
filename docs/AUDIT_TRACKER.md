# Stone Henge — Audit Tracker

> **Updated:** February 26, 2026
> **Status:** ACTIVE

---

## Resolved

| ID | Description | Resolution | PR |
|----|-------------|------------|----|
| A-03 | slab-optimizer.ts not L/U shape aware — oversize splitter fires on bounding box before decomposition | Shape decomposition moved to Step 1 (before oversize splitting). Each leg is now checked individually against slab dimensions. | fix/optimizer-shape-before-oversize |
| R-11 | L-shape INNER + R-BTM edges unclickable, unstorable, unpriced | Extra edges now stored in shape_config.edges JSON. Calculator and optimizer consume them. | fix/10e-lshape-edge-storage |
| R-12 | AUDIT_TRACKER.md not enforced — documentation steps skipped by Claude Code | pre-push hook now blocks pushes on fix/* feat/* branches if tracker not updated | fix/enforce-audit-tracker-hook |
| R-13 | Railway build broken by prepare script (no .git dir in CI) | install-hooks.sh now exits silently when .git directory absent | fix/hotfix-railway-prepare-script |

---

## Open

_No open audit items._
