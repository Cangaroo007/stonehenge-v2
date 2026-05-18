# STONEHENGE V2 — MASTER ROADMAP
## Version: March 26, 2026 — EOD
## Supersedes: ROADMAP-2026-03-24-EOD.md

---

## CURRENT MAIN: `1428713` — Railway ✅ Green

---

## TIER 0 — IN-FLIGHT (merge before starting anything)

| Sprint | What | Status |
|--------|------|--------|
| **PR #568** | Mini SVG thumbnail camelCase fix for RADIUS_END arc edges | 🟡 PR open — merge conflict on docs only |
| **COMPARE-2b** | Material comparison panel UI | 🟡 PR open — merge first |

---

## TIER 1 — FIRE NEXT (in order)

### 1. SPLASHBACK-STRIP-FIX-1
**Problem:** Splashbacks don't suppress parent edge strips — confirmed bug in rules doc.
**Fix:** Add joined edge to `no_strip_edges` in waterfall modal `onConfirm` for SPLASHBACK type.
**Status:** 🟡 Needs bash audit first

### 2. REL-ENUM-FIX-1
**Problem:** API accepts `RETURN_END`, `ISLAND`, `LAMINATION` as relationship types but Prisma enum doesn't have them. Silent data corruption possible.
**Fix:** Validate against Prisma enum in relationships POST handler, return 400 with helpful message.
**Status:** 🟡 Needs bash audit first

---

## TIER 2 — THIS WEEK

### Quote builder completeness
| Sprint | What | Status |
|--------|------|--------|
| **COMPAT-ENFORCE-1** | Wire material_edge_compatibility — block Bullnose+Sintered, Ogee+Sintered | Needs prompt |
| **EDGE-SYNC-4** | ExpandedPieceViewClient L/U edge save path verification | Needs bash audit |

### Config tasks (no code)
| Task | What | Status |
|------|------|--------|
| Arris + Pencil Round rates | Enter rates after Jay confirms | Blocked on Jay |
| N.SOFT/N.HARD/SINTERED/N.PREMIUM sign-off | Jay review | Blocked on Jay |

---

## TIER 3 — SHORT TERM (next 1–2 weeks)

### Piece rules enforcement
| Sprint | What | Notes |
|--------|------|-------|
| **SCHEMA-RULES-1** | Add `position_mm`, `coverage_mm` to piece_relationships; `trimAllowance_mm`, `grain_direction` to materials | One migration sprint |
| **PIECE-RULES-ENFORCE-1** | Server-side enforcement of piece rules doc v2.0 | After Jay sign-off on rules |
| **RADIUS-DISPLAY-1** | Show straight section length in RADIUS_END dimensions row | "Straight run: 2800mm" |

### PDF series
| Sprint | What | Status |
|--------|------|--------|
| **PDF-0** | Bash audit of current PDF infrastructure against new rules | Run first |
| **PDF-1** | Four detail levels (Total Only / Summary / Room / Itemised) | After PDF-0 |
| **PDF-2** | Material comparison page in PDF (feeds from COMPARE-2) | After PDF-1 + COMPARE-2 |
| **PDF-3** | Send to customer via email (Resend) | After PDF-1 |

### Architecture
| Sprint | What | Notes |
|--------|------|-------|
| **PIECE-RULES-DOC-1** | Add rules doc v2.0 to repo at `docs/PIECE-RULES.md` | Write once, enforce from it |
| **ARCH-1** | Shared `mapQuotePiece()` utility refactor | After rules enforcement |

### Quote features
| Sprint | What | Notes |
|--------|------|-------|
| **Regression anchors** | Jay + Beau create test quotes, lock into `scripts/regression-check.ts` | Blocked on Jay rates sign-off |
| **Quote status flow** | Draft → Quoted → Accepted → Locked | Schema exists |
| **Analytics** | PostHog funnels + Microsoft Clarity | ~1 day, unblocked |

---

## TIER 4 — MEDIUM TERM (2–4 weeks)

### Unit Block
| Sprint | What | Notes |
|--------|------|-------|
| **UNIT-BLOCK-AUDIT-1** | Read-only audit — what exists, what works, what's broken | Prompt ready — run anytime |
| Unit Block v2 | Based on audit findings | After audit |

### Wall edge feature
| Sprint | What | Notes |
|--------|------|-------|
| **WALL-EDGE-1** | Mark edges as against-wall, warn on waterfall-to-wall-edge | Needs Jay: do wall edges suppress strips? ✅ YES (rules doc confirms) |

### Series 13 — Spatial View
| Sprint | What | Notes |
|--------|------|-------|
| **SPATIAL-3** | Child piece grouping — unrelated parents handled correctly | Prompt written, not fired |

---

## TIER 5 — LONGER TERM (1–2 months)

### Series 14 — Customer & PDF
| Sprint | What | Notes |
|--------|------|-------|
| **Customer contacts** | Contact management on customer records | Schema exists |
| **Quote send flow** | Send to customer via email with PDF attached | After PDF-1 |

### AI Features — Series 8
| Sprint | What | Notes |
|--------|------|-------|
| **8.1–8.4 Visual-to-Stone** | AI auto-identifies stone from PDF elevations | Long term |
| **8.5 Waste toggle** | 10–15% waste factor toggle | |
| **8.6–8.7 NL text + voice** | "Change all sills to bullnose granite" | |
| **8.8 Budget Negotiator** | Scans quote for top 3 cost drivers, suggests alternatives | |

---

## TIER 6 — LONG TERM (2–3 months)

| Series | What |
|--------|------|
| **Series 5/6/7** | SaaS multi-tenant launch — billing, subscriptions, onboarding |
| **Clerk multi-tenant** | Organisation management, per-tenant pricing config |
| **Marketing site** | Public-facing stonehenge.app |

---

## EXTERNAL DEPENDENCIES

| Item | Waiting on | Unblocks |
|------|-----------|----------|
| Arris + Pencil Round rate decision | Jay | Edge rates complete, accurate pricing |
| N.SOFT/N.HARD/SINTERED/N.PREMIUM sign-off | Jay | Regression anchors |
| Slab size confirmation per material | Jay | Optimiser accuracy |
| Pricing doc sign-off | Jay | Platform go-live |
| Piece Rules Doc v2.0 review | Jay | PIECE-RULES-ENFORCE-1 |
| Regression test quotes | Jay + Beau | scripts/regression-check.ts |

---

## WHAT BLOCKS GO-LIVE (updated order)

1. **Arris/Pencil Round rate decision** — every quote with finished edges mispriced
2. **Regression anchors** — no verified baseline for calculator accuracy
3. **PDF-1** — no customer-facing output with correct format
4. **SPLASHBACK-STRIP-FIX-1** — splashback quotes have wrong strip pricing

---

## CONFIRMED REMOVED FROM ROADMAP

| Sprint | Why removed |
|--------|------------|
| WATERFALL-BUILDUP-FIX-1 | ✅ Already implemented — QuoteDetailClient line 4680, WF-8 |
| SPATIAL-2 | ✅ MIN_SVG_WIDTH=1400 confirmed in room-layout-engine.ts |
| OPT-SHAPE | ✅ pieceAreaValues correctly uses getShapeGeometry |
| SINGLE-ENGINE-AUDIT-1 | ✅ Complete — PDF-TOTAL-FIX-1 shipped the fix |
| RADIUS-SHAPE-FIX-1 | ✅ Superseded by RADIUS-ARC-EDGE-1 — full fix across 8 points in 5 files (#566) |
| PRICING-ADMIN-CRUD-1 | ✅ Shipped as pricing-admin-2 + pricing-admin-3 — edge types, cutout types, service rates CRUD all live |

---

## SPRINT NAMING CONTINUITY

| ID | Sprint | Status |
|----|--------|--------|
| VIEW-SYNC-1 | Summary row visible when accordion open | ✅ Main |
| EDGE-SYNC-1 through 3 | Edge sync fixes | ✅ Main |
| UX-FIX-1 | N-STR label, Position dropdown, name save | ✅ Main |
| TEMPLATE-RESEED-1 | 12 streamlined templates | ✅ Main |
| TEMPLATE-UX-1 | FromTemplateSheet dark redesign + multi-select | ✅ Main |
| HEADER-TOTAL-FIX-1 | Header total reflects active option | ✅ Main |
| COMPARE-1 | Compare Material stops creating options | ✅ Main |
| TEMPLATE-SELECTOR-REDESIGN-1 | TemplateSelector dark redesign | ✅ Main |
| BULK-MATERIAL-PICKER-FIX-1 | BulkMaterialDialog uses MaterialPickerV2 | ✅ Main |
| WF-ROOM-FIX-1 | Waterfall room assignment race condition | ✅ Main (#532) |
| LABEL-FIX-2 | Expanded diagram labels: MIT 40mm, WF, SB | ✅ Main (#533) |
| CURVED-LU-DISPLAY-FIX-1 | L/U and RADIUS_END edges show correct profiles | ✅ Main (#534) |
| PDF-TOTAL-FIX-1 | PDF uses fresh calculator totals | ✅ Main (#535) |
| RADIUS-EDGE-FIX-1 | RADIUS_END straight edge save + inactive edge filter | ✅ Main (#536) |
| COMPARE-2a | estimate-material API + comparison_slots schema | ✅ Main (#537) |
| RADIUS-ARC-EDGE-1 | Arc edges on RADIUS_END — PUT handler + 4-location propagation + camelCase fixes | ✅ Main (#566) |
| PRICING-ADMIN-2 | Pricing admin CRUD for edge types + cutout types | ✅ Main (deployed) |
| PRICING-ADMIN-3 | Pricing admin service rates CRUD + isActive filtering | ✅ Main (deployed) |
| COMPARE-2b | Material comparison panel UI | 🟡 PR open |
| RADIUS-ARC-EDGE-1-SVG | Mini SVG thumbnail camelCase fix | 🟡 PR #568 open |
| SPLASHBACK-STRIP-FIX-1 | Splashback suppresses parent edge strip | ⚪ Needs bash audit |
| REL-ENUM-FIX-1 | Reject invalid relationship types at API | ⚪ Needs bash audit |
| COMPAT-ENFORCE-1 | Wire material_edge_compatibility enforcement | ⚪ Needs prompt |
| PDF-0 | PDF infrastructure audit | ⚪ Run first |
| PDF-1 | Four detail levels | ⚪ After PDF-0 |
| WALL-EDGE-1 | Wall edge marking + warnings | ⚪ Rules confirmed, needs prompt |
| ANALYTICS-1 | PostHog + Clarity | ⚪ Unblocked |
| UNIT-BLOCK-AUDIT-1 | Unit block system audit | ⚪ Prompt ready |

---

*Prepared: March 26, 2026 — EOD*
*Supersedes: ROADMAP-2026-03-24-EOD.md*
