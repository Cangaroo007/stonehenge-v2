# Stone Henge — Component Inventory Reference

**Last Updated:** February 18, 2026

## Purpose

This document maps every component that renders edges, cutouts, and pieces.

**Rule:** When updating ANY edge, cutout, or piece rendering feature, check this inventory and update ALL affected components.

---

## Shared Utilities (DRY Enforcement)

These functions are currently duplicated across 3–5 files each. They must be extracted to a shared module.

| Utility | Purpose | Target Location | Currently Duplicated In |
|---------|---------|-----------------|------------------------|
| `edgeColour(profile)` | Returns hex colour for edge profile | `src/lib/utils/edge-utils.ts` | PieceVisualEditor, RoomPieceSVG, MiniSpatialDiagram, RoomSpatialView |
| `edgeCode(profile)` | Returns 2–3 letter abbreviation (PR, BN, CML, RAW) | `src/lib/utils/edge-utils.ts` | PieceVisualEditor, RoomSpatialView |
| `cutoutLabel(type)` | Returns short display name for cutout type | `src/lib/utils/edge-utils.ts` | PieceVisualEditor |

---

## Primary Editing Components (Changes Here = Must Propagate)

These are the components users directly interact with to edit edges/cutouts. They set the standard — all other components should match their visual output.

| Component | Location | Context | Role |
|-----------|----------|---------|------|
| PieceVisualEditor.tsx | `src/components/quotes/` | PieceRow expanded + InlinePieceEditor | The gold standard SVG editor — has ALL features |
| RoomPieceSVG.tsx | `src/components/quotes/` | Inside RoomSpatialView spatial diagrams | SVG piece rendering in spatial/room view |
| RoomSpatialView.tsx | `src/components/quotes/` | Spatial accordion (edit + view modes) | Parent that orchestrates RoomPieceSVG + EdgeProfilePopover |
| EdgeProfilePopover.tsx | `src/components/quotes/` | Rendered by PVE, RSV, MiniPieceEditor | The popover for selecting edge profiles + scope |

---

## Component Parity Matrix

| Component | Context | Edge Labels | Edge Colours | Edge Tooltips | Edge Click | Edge Hover | Batch Scope | Cutout Badges | Cutout Add/Rm | Cutout Tooltips |
|-----------|---------|:-----------:|:------------:|:-------------:|:----------:|:----------:|:-----------:|:-------------:|:-------------:|:---------------:|
| PieceVisualEditor.tsx | Detailed edit | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| RoomPieceSVG.tsx | Spatial view SVG | ❌ | ✅ | ❌ | ✅ | ✅ | —\* | ✅ | —\* | ✅ |
| RoomSpatialView.tsx | Spatial accordion | —\* | —\* | ✅ | ✅ | —\* | ✅ | ✅ | ✅ | ❌ |
| MiniPieceEditor.tsx | Quick View edit | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| PieceRow.tsx (collapsed) | List/Rooms view | ✅\* | ❌ | ❌ | — | — | —\* | ✅\* | — | ❌ |
| PieceRow.tsx (expanded) | List/Rooms view | ✅\* | ✅\* | ✅\* | ✅\* | ✅\* | ✅\* | ✅\* | ✅\* | ✅\* |
| RoomLinearView.tsx | Print view | ✅ | ❌ | ❌ | — | — | — | ✅ | — | ✅ |
| InlinePieceEditor.tsx | Add new piece form | —\* | —\* | —\* | ✅\* | ✅\* | ❌ | ✅ | ✅ | ❌ |
| StreamlinedAnalysisView.tsx | Drawing wizard | ❌ | ✅ | ❌ | — | — | — | ✅ | — | ❌ |
| MiniSpatialDiagram.tsx | Job view | ❌ | ✅ | ❌ | — | — | — | ✅ | — | ❌ |
| MaterialView.tsx | Material grouping | ❌ | ❌ | ❌ | — | — | — | ❌ | — | ❌ |

**Legend:**
- ✅ = Feature present
- ❌ = Feature missing (gap)
- — = Not applicable (read-only view or not relevant)
- —\* = Delegated to child component
- ✅\* = Provided via embedded PieceVisualEditor

---

## Actionable Gaps (Priority Ordered)

### High Priority (Functional Gaps)

| # | Component | Missing | Impact |
|---|-----------|---------|--------|
| G1 | MiniPieceEditor.tsx | Batch scope selector | Quick View users can't batch-apply edges — forced to switch to Detailed view |
| G2 | RoomPieceSVG.tsx | Edge profile labels (PR/BN/CML) | Spatial view doesn't show what profile is on each edge at a glance |

### Medium Priority (Visual Consistency)

| # | Component | Missing | Impact |
|---|-----------|---------|--------|
| G3 | PieceRow.tsx (collapsed) | Edge colour indicators | Text-only summary lacks visual differentiation |
| G4 | RoomLinearView.tsx | Edge colour on strokes | Print view has same stroke colour regardless of profile |
| G5 | MiniPieceEditor.tsx | Edge hover feedback | No visual highlight before clicking |
| G6 | MaterialView.tsx | Any edge/cutout info | Material grouping provides zero edge/cutout visibility |

### Low Priority (Cosmetic Polish)

| # | Component | Missing | Impact |
|---|-----------|---------|--------|
| G7 | MiniPieceEditor.tsx | Edge SVG tooltips | Hover doesn't show full profile name |
| G8 | PieceRow.tsx (collapsed) | Edge + cutout tooltips | No hover info on summary text |
| G9 | RoomSpatialView.tsx | Cutout tooltips in accordion | Accordion cutout badges lack hover names |
| G10 | StreamlinedAnalysisView.tsx | Edge labels | Drawing wizard SVGs don't show profile codes |
| G11 | MiniSpatialDiagram.tsx | Edge labels | Job view SVGs don't show profile codes |

---

## Component Hierarchy (Import Tree)

```
QuoteDetailClient.tsx
├── RoomSpatialView.tsx (always in edit mode)
│   ├── RoomPieceSVG.tsx (per piece)
│   ├── RelationshipConnector.tsx
│   └── EdgeProfilePopover.tsx
├── PieceRow.tsx (list/rooms view)
│   ├── PieceVisualEditor.tsx (when expanded)
│   │   └── EdgeProfilePopover.tsx
│   ├── InlinePieceEditor.tsx (add new piece)
│   │   └── PieceVisualEditor.tsx
│   └── RelationshipEditor.tsx
├── MiniPieceEditor.tsx (quick view)
│   ├── PieceVisualEditor.tsx (functions only: edgeColour, edgeCode)
│   └── EdgeProfilePopover.tsx
├── MaterialView.tsx (material grouping)
└── OptionTabsBar.tsx

Print View: RoomLinearView.tsx (standalone)
Job View: MiniSpatialDiagram.tsx (standalone)
Wizard: StreamlinedAnalysisView.tsx (standalone)
```

---

## Update Checklist

When modifying edge/cutout/piece rendering, use this checklist:

### Edge Profile Changes

- [ ] PieceVisualEditor.tsx (gold standard)
- [ ] RoomPieceSVG.tsx (spatial SVG)
- [ ] RoomSpatialView.tsx (spatial accordion)
- [ ] MiniPieceEditor.tsx (quick view)
- [ ] PieceRow.tsx (collapsed summary)
- [ ] RoomLinearView.tsx (print view)
- [ ] EdgeProfilePopover.tsx (popover options)
- [ ] edge-utils.ts shared utility (if colour/code mapping changes)

### Cutout Changes

- [ ] PieceVisualEditor.tsx
- [ ] RoomPieceSVG.tsx
- [ ] RoomSpatialView.tsx
- [ ] MiniPieceEditor.tsx
- [ ] PieceRow.tsx
- [ ] RoomLinearView.tsx
- [ ] CutoutAddDialog.tsx
- [ ] edge-utils.ts shared utility (if label mapping changes)

### New Piece Type or Field

- [ ] PieceVisualEditor.tsx
- [ ] PieceRow.tsx
- [ ] MiniPieceEditor.tsx
- [ ] InlinePieceEditor.tsx
- [ ] ManualQuoteWizard.tsx
- [ ] StreamlinedAnalysisView.tsx

---

*This document must be updated whenever components are added, removed, or renamed.*
