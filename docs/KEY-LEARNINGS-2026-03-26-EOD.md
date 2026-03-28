# KEY LEARNINGS — March 26, 2026
## Supersedes: KEY-LEARNINGS-2026-03-25-EOD.md
## Audience: Every Claude Code session — read ALL standing rules first

---

## STANDING RULES — NON-NEGOTIABLE, EVERY SESSION

| Rule | Detail |
|------|--------|
| `gh` CLI not available | GitHub UI only for PRs — never put `gh pr create` in any prompt |
| Claude Code NEVER runs git commands | Sean handles ALL commits, pushes, and merges — no exceptions |
| `npx tsc --noEmit` before every push | Run locally by Sean, not in Claude Code |
| `npm run build` runs locally by Sean | NOT in Claude Code — ever |
| `npx prisma generate` after any schema change | Keep types in sync |
| Never auto-resolve `prisma/schema.prisma` | Manual field-by-field resolution only |
| Variables before hooks | `useMemo` must be declared above any `useCallback` that references it |
| `Array.from(new Set(...))` | Never spread syntax on Sets — Railway build failure |
| `await params` in route handlers | Next.js 14 requirement |
| `as unknown as TargetType` | Never direct cast on Prisma JSON fields |
| Australian spelling throughout | metre, colour, optimiser, organisation |
| Both sqm columns always together | `price_per_sqm` AND `price_per_square_metre` |
| `prisma migrate resolve --applied` after manual SQL | Prevents crash loops |
| Auth import: `@/lib/auth` | NOT `@/lib/auth-helpers` |
| Every commit must have detailed PR body | What changed / Root cause / Verify in production |
| Investigation ≠ Fix | Handoff must explicitly list what was fixed vs what was only investigated |
| Create branch BEFORE committing | `git checkout -b fix/name` before any `git commit` |
| Branch creation is Sean's job | Claude Code NEVER creates branches |
| doc files now use union merge | `.gitattributes` configured — AUDIT_TRACKER.md and SYSTEM_STATE.md auto-merge |
| PUT and PATCH handlers must stay in sync | Any field added to PATCH must also be added to PUT — check BOTH |
| Mini SVG has its own code path | QuickViewPieceRow line ~1774 reads arc config separately from expanded view prop at line ~2256 |

---

## LESSON 121: effectiveShapeType Must Trust shapeType Prop, Not shapeConfig.shape

**Symptom:** RADIUS_END pieces rendered as rectangles despite 10+ PRs fixing shape handling. Quick Edge and Select mode could not apply edge profiles to arc edges.

**Root cause (partial):** `PieceVisualEditor.tsx` line 685 had `effectiveShapeType` gated on BOTH `shapeType === 'RADIUS_END'` AND `shapeConfig?.shape === 'RADIUS_END'`. When `shapeConfig` was null or lacked the `.shape` discriminant (common for existing DB data), the condition failed and fell through to `return 'RECTANGLE'`. This killed the ENTIRE rendering chain — shape layout, edge definitions, arc paths, click handlers — everything downstream.

**Fix applied (PR #559):**
```typescript
const effectiveShapeType: ShapeType = useMemo(() => {
    if (shapeType && shapeType !== 'RECTANGLE') {
        return shapeType;
    }
    return 'RECTANGLE';
}, [shapeType]);
```

**STATUS: FIX MERGED BUT BUG PERSISTS.** Arc edges on RADIUS_END pieces still cannot be clicked or saved in production after this fix deployed. The effectiveShapeType gatekeeper was a real bug but was NOT the only root cause. There is at least one more layer of failure preventing arc edge interaction.

**Rule:** `shapeType` prop is the canonical source of truth for shape rendering. But also: when a bug persists after fixing the obvious gatekeeper, there are multiple gatekeepers. Don't assume a single root cause for a multi-layer rendering chain.

---

## LESSON 122: Edge Labels Should Show Calculated Lengths, Not Side Names

**Symptom:** RADIUS_END piece edge labels showed "Top", "Arc" instead of calculated mm lengths.

**Root cause:** Edge label rendering used `edge.label` (the side name) instead of `edge.lengthMm` (the calculated length). The `lengthMm` values were correctly computed in the RADIUS_END edge definitions but never displayed.

**Fix:**
```typescript
if (!isFinished) return `RAW ${edge.lengthMm ? Math.round(edge.lengthMm) + 'mm' : edge.label}`;
// ...
return `${code} ${edge.lengthMm ? Math.round(edge.lengthMm) + 'mm' : edge.label}`;
```

**Rule:** When edge definitions compute `lengthMm`, the label rendering must use it. Always check that computed values in edge definitions actually flow through to the display layer.

---

## LESSON 123: Null Guard shapeConfig Casts for Shapes That May Lack Config

**Symptom:** Potential runtime crash when RADIUS_END pieces have `shapeConfig = null`.

**Root cause:** `const cfg = shapeConfig as RadiusEndConfig` — direct cast without null check. When shapeConfig is null, `cfg.length_mm` throws.

**Fix:** Cast as `RadiusEndConfig | null`, use optional chaining with fallback chain:
```typescript
const cfg = shapeConfig as RadiusEndConfig | null;
const W = cfg?.length_mm ?? lengthMm ?? 2400;
const H = cfg?.width_mm ?? widthMm ?? 600;
```

**Rule:** When casting shapeConfig for ANY shape type, always include `| null` in the cast and use optional chaining. Existing DB pieces may have `shape_type` set but `shape_config` as null.

---

## LESSON 124: Multiple Layers of Defence Can Create Multiple Points of Failure

**Symptom:** 10+ PRs over two days — each fixing a real bug at a different layer — but the core issue persisted.

**What happened:** The shape rendering chain has ~5 layers: prop casting → effectiveShapeType → shape layout → edge definitions → click handlers. PRs fixed layers 1, 3, 4, and 5. But layer 2 (effectiveShapeType) was the gatekeeper that blocked everything downstream. Each individual PR was correct but none addressed the choke point.

**Rule:** When a bug persists after multiple targeted fixes, trace the FULL rendering chain from data source to user interaction. List every transformation/decision point. The bug is at whichever layer acts as a gatekeeper — where failure kills ALL downstream functionality regardless of how correct those downstream layers are.

---

## LESSON 125: When 12+ PRs Don't Fix a Bug, Stop Auditing Code and Start Auditing Runtime

**Symptom:** RADIUS_END arc edges still can't be clicked/saved after 12+ merged PRs across two days. Every code-level audit says the chain is correct.

**What went wrong:** Every session audited the same code paths (effectiveShapeType, click handlers, save routing, API) and found real bugs — but the core symptom persisted. We never verified at RUNTIME whether the arc path SVG actually renders in the DOM, whether clicks reach the handler, or what the DB actually contains for these pieces.

**Rule:** Before writing ANY more code fixes: verify at runtime first. Check the DOM, add console.log, query the DB directly.

---

## LESSON 126: PUT and PATCH Handlers Are Independent Code Paths — Always Check Both

**Symptom:** Arc edges on RADIUS_END pieces appeared to save via Quick Edge but were silently dropped. 12+ PRs audited the PATCH handler and the entire frontend chain — all correct.

**Root cause:** The route file `src/app/api/quotes/[id]/pieces/[pieceId]/route.ts` has TWO independent HTTP handlers — PATCH (line 229) and PUT (line 564). The PATCH handler correctly destructured and saved `edgeArcConfig`. The PUT handler was completely MISSING `edgeArcConfig`. Frontend sends PUT via `handleInlineSavePiece`, so every save silently dropped arc edge profiles.

**How we found it:** Runtime debugging — sent identical payloads to both handlers and compared responses. PUT returned `edgeArcConfig: null` while PATCH returned the saved value.

**Fixes:** Added `edgeArcConfig` to PUT destructuring, Prisma update (with `as unknown as Prisma.InputJsonValue`), and response.

**Rule:** When adding ANY field to a PATCH handler, ALWAYS check the PUT handler in the same file. They are independent code paths that must stay in sync. This is now a standing rule.

---

## LESSON 127: snake_case vs camelCase Bugs Can Hide in Multiple Code Paths

**Symptom:** After the main RADIUS-ARC-EDGE-1 fix deployed, the summary mini SVG thumbnail showed arc edges as RAW while the expanded PieceVisualEditor correctly showed them as ARR (Arris).

**Root cause:** `QuickViewPieceRow.tsx` line 1774 reads `fullPiece.edge_arc_config` (snake_case DB column name) for the mini SVG thumbnail. The expanded view correctly reads `fullPiece.edgeArcConfig` (camelCase API response). The API returns camelCase, so the snake_case read always returned `undefined`, making all arc edges appear as RAW.

**Fix:** Changed `edge_arc_config` to `edgeArcConfig` in the mini SVG arc config read — one line.

**Rule:** When fixing a snake_case → camelCase bug, grep the ENTIRE file for other instances of the same snake_case field. The same bug pattern often exists in multiple code paths within the same file (expanded view vs mini SVG, read vs write, etc.).

---

## LESSON 128: Pre-push Hooks That Compare Against Tracking Branches Can Block After Rebase

**Symptom:** `git push --force-with-lease` blocked by pre-push hook even after rebase resolved all conflicts.

**Root cause:** The pre-push hook compares `$REMOTE_BRANCH..HEAD` to check for doc file changes. After rebase, the remote tracking branch (`origin/fix/radius-arc-edge-1`) already contains the same doc content as the rebased commits. The diff shows zero doc changes, causing the hook to fail.

**Workaround:** `git branch --unset-upstream` so the hook falls back to `main..HEAD` comparison, which will show the doc changes.

**Rule:** After rebase onto main, if the pre-push hook blocks because tracking branch comparison shows no doc diff, unset upstream before pushing. Or resolve via GitHub web editor for doc-only conflicts.

---

## CURVED PIECE ARCHITECTURE (reference — updated)

```
Edge storage by shape type:
  RECTANGLE: edge_top, edge_bottom, edge_left, edge_right (DB columns)
  L_SHAPE/U_SHAPE: shape_config.edges (JSONB sub-object)
  RADIUS_END:
    - Straight edges (top/bottom/left): edge_top, edge_bottom, edge_left (DB columns)
    - Arc edge: edge_arc_config.arc_end (JSONB)
  ROUNDED_RECT: corners in edge_arc_config; straights in DB columns
  FULL_CIRCLE/CONCAVE_ARC: edge_arc_config

Shape rendering gatekeeper:
  effectiveShapeType in PieceVisualEditor.tsx
  Trusts shapeType prop ONLY — does NOT require shapeConfig.shape match
  shapeConfig provides dimensions, NOT rendering permission

Read path (QuickViewPieceRow → PieceVisualEditor):
  shapeConfigEdges branches by shape type:
    L/U → piece.shapeConfig.edges
    RADIUS_END → edge_arc_config (for arc_end only)
    Others → edge_arc_config
  Mini SVG thumbnail has SEPARATE read path at line ~1774

Write path (handleShapeEdgeChange in QuickViewPieceRow):
  L/U → savePieceImmediate({ shapeConfig: { edges: { [edgeId]: profileId } } })
  RADIUS_END + edgeId !== 'arc_end' → savePieceImmediate({ edgeTop/Bottom/Left: profileId })
  arc_end + all other curved → savePieceImmediate({ edgeArcConfig: { [edgeId]: profileId } })

API save path:
  Frontend → PUT handler (route.ts line 564) → must include edgeArcConfig
  Frontend → PATCH handler (route.ts line 229) → must include edgeArcConfig
  BOTH handlers must stay in sync for every field

RADIUS_END dimension convention (confirmed):
  length_mm = bounding box total (arc fits WITHIN, not added beyond)
  straight_section = length_mm - radius_mm (ONE end) or length_mm - (2 × radius_mm) (BOTH)
```

---

## PIECE RULES v2.0 — KEY FACTS LOCKED

```
Waterfall build-up:     AUTO-REMOVED when waterfall attached (already in code, WF-8)
Splashback strips:      Should suppress parent edge strip — NOT YET IMPLEMENTED
Wall edge:              Suppresses polishing + strips. Does NOT suppress cutting. NEVER has build-up.
Bullnose + Sintered:    BLOCKED (hardcoded physics — exposes core)
Ogee + Sintered:        BLOCKED (same reason)
RETURN_END/ISLAND/LAMINATION: NOT valid relationship types — API must reject
GST rate:               0.1000 (10%) stored in pricing_settings.gst_rate — NOT hardcoded
```

---

*Prepared: March 26, 2026 — EOD*
*Supersedes: KEY-LEARNINGS-2026-03-25-EOD.md*
*New lessons: 126–128*
