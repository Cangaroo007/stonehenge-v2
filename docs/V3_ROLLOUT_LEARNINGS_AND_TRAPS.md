# Stonehenge v3 Rollout Learnings and Traps to Avoid

Date: 2026-05-16

## Executive Summary

The biggest v2 lesson is that trade concepts must be explicit in the data model. A lot of the v2 instability came from one field or label carrying several meanings at once: edge finish, mitred construction, build-up, wall suppression, attached joins, spatial relationship, and chargeability.

For v3, the quote model should be boring, auditable, and precise. The AI and UX can be clever, but the saved quote truth should be clear enough that a stone estimator, developer, or auditor can inspect a quote and immediately understand why every line is charged.

## Core Concepts That Must Stay Separate

### 1. Visible Edge Profile

This is what the customer sees: Arris, Pencil Round, Bevel, Bullnose, Raw, etc.

Do not use this field to mean build-up, mitre construction, relationship type, or charge suppression.

### 2. Edge Construction / Build-Up

This is how the edge is physically made: no build-up, laminated/build-up apron, mitred build-up, 20mm, 40mm, 60mm, custom depth, support strip, return strip.

Mitred is a construction method, not a visible edge profile. A mitred build-up can still have a visible profile such as Pencil Round or Arris.

### 3. Piece Relationship

This is how pieces connect: waterfall, splashback, return, butt join, mitre join, window sill, etc.

Relationship truth should be explicit. Do not infer saved relationships from piece names except as draft suggestions.

### 4. Edge Charge Behaviour

Chargeability needs its own model:

- charge cutting
- charge visible profile/polish
- charge install
- suppress because wall-facing
- suppress because attached join
- suppress because promoted/apron strip already represents it

These should not be hidden inside an overloaded `no_strip_edges` style field.

### 5. Spatial Layout

Spatial layout should render from explicit relationships and geometry:

- parent piece
- child piece
- join side
- offset
- coverage length
- orientation
- wall-facing edges
- room context

The renderer should not invent truth from names like “Kitchen waterfall left.” Name parsing can suggest; it should not decide.

## Data Model Recommendations

Use explicit entities or sub-objects similar to:

- `Piece`
- `PieceEdge`
- `EdgeProfile`
- `EdgeConstruction`
- `PieceRelationship`
- `ChargeLine`
- `Override`
- `ExtractionDraft`
- `ExtractionCorrection`
- `CalculationSnapshot`

For each `PieceEdge`, consider storing:

- side / segment id
- visible profile id
- construction method
- build-up depth
- exposed / not exposed
- wall-facing
- attached relationship id
- chargeCut
- chargeProfile
- chargeInstall
- notes / source

For each `ChargeLine`, store:

- category
- quantity
- unit
- rate
- rate source
- formula
- related piece/edge/cutout/relationship
- override status
- override reason
- tax treatment

## AI Reader and Learning Loop

Do not let AI output directly become final quote truth.

The AI reader should produce an extraction draft with:

- source file and page
- detected pieces
- dimensions
- materials
- edge profiles
- build-ups
- cutouts
- splashbacks/waterfalls/returns
- confidence per field
- evidence references where possible
- model version and prompt version

Human correction should store:

- extracted value
- corrected value
- correction type
- why it was wrong
- whether it affected price
- reviewer
- timestamp

This correction log is the ML/training asset. Without it, every AI improvement becomes guesswork.

The Claude project audit also makes one point very strongly: do not treat every drawing as the same problem. The reader needs a router before extraction:

- classify each page as plan, elevation, section, 3D render, title page, or other
- classify the source as stone shop drawing, cabinetry pack, tradie sketch, architectural plan, DXF/vector export, or unknown
- only send pages with real plan-view benchtop geometry to the geometry extractor
- use elevations, renders, and spec pages as cross-check evidence, not primary geometry

The reader should have specialist extraction prompts for at least:

- tradesman sketches with mixed cabinet notes and dimensions
- stone shop drawings with legends and edge symbols
- clean CAD/vector benchtop plans
- multi-page cabinetry packs where the benchtop is inferred from cabinet runs

For dimensions, do not rely on vision alone. The robust path is OCR first, with bounding boxes for numeric tokens, then LLM association of those tokens to edges, cutouts, and callouts. Vision models can read a drawing shape impressively while still inventing or misplacing a number.

The extractor should read in this order:

1. title block / project metadata
2. units and scale
3. legend / edge symbol mappings
4. spec block
5. main plan geometry
6. cutouts
7. secondary pieces
8. joints and callouts
9. reconciliation warnings

## Calculator Design Rules

The calculator should be a pure calculation engine:

- no Prisma/database calls inside core calculation
- no UI assumptions
- no hidden defaults that change by screen
- input is structured quote truth
- output is auditable charge lines

Every output line should explain:

- what was measured
- how it was measured
- what rate was used
- where the rate came from
- what override changed it, if any

Avoid “magic totals.” If the number cannot be traced, it will be very hard to compare against Northcoast/Acrual.

## Overrides Are Product, Not Hacks

NCS appears to use judgement, customer-specific loading, manual additions, and non-uniform quoting practices. v3 should embrace this with controlled overrides:

- quote-level adjustment
- room-level adjustment
- piece-level adjustment
- category multiplier
- category fixed adjustment
- chargeable LM override
- rate override
- quantity override
- signed/manual adjustment line

Every override needs a reason and audit trail.

## Specific v2 Traps to Avoid Repeating

1. Do not bind “mitred” tightly to “edge profile.”

2. Do not use one field to mean both “against wall” and “attached join suppresses strip.”

3. Do not let a waterfall/splashback child live in another room unless explicitly cross-room and intentionally displayed that way.

4. Do not allow a spatial view to infer relationships from names after quote truth already exists.

5. Do not use collection average material price when the quote needs conservative/generic pricing. Use the highest relevant piece/material or make the pricing basis explicit.

6. Do not hide build-up semantics inside thickness alone. A 40mm piece and a 20mm piece with one 40mm build-up edge are not the same thing.

7. Do not make slab optimizer output look more authoritative than it is. If it is an estimating layout, label it as such.

8. Do not create AI imports that silently miss cutouts, build-ups, or attached pieces without a review checklist.

9. Do not let PDFs be generated from different logic than the on-screen quote. The PDF should be a view of the same calculation snapshot.

10. Do not rely on final totals alone when comparing to NCS. Compare line categories: material, cutting, profile/edge labour, cutouts, install, delivery, discounts, manual adjustments, GST.

11. Do not silently assign material to pieces for optimiser convenience. A piece without material should be excluded from slab allocation unless it is an explicitly attached waterfall/splashback child inheriting the parent material.

12. Do not let optimiser persistence overwrite human grain/vein decisions. Optimiser runs may persist oversize and join facts, but grain requirements must come from material, relationship, or user intent.

13. Do not hard-code slab sizes as truth. Slab dimensions and trim/edge allowance belong on material records, with type-level defaults only as fallback.

14. Do not skip dimension reconciliation on AI imports. Partial dimension chains should be summed and checked against overall dimensions; conflicts should create review warnings rather than guessed geometry.

15. Do not model `RETURN` as a relationship. A return is a piece type joined to another piece; the relationship is the join.

16. Do not let cabinetry annotations become stone features. Labels like drawers, doors, kick boards, appliance spaces, shelves, and bulkheads are evidence about cabinetry, not automatically benchtop pieces or cutouts.

17. Do not omit fabrication-critical callouts. Joints, small radius notes, post cut-arounds, sink/cooktop type, and edge legends need first-class extraction fields.

18. Do not make edge symbols tenant-global when a drawing has its own legend. The drawing legend wins.

## Slab Optimizer Guidance

For early v3, position the optimizer as material allowance / estimating support unless it supports:

- slab size and usable area
- saw kerf
- edge allowance
- strip generation
- build-up strip semantics
- grain/vein direction
- rotation rules
- slab defects
- remnant stock
- oversize splitting
- seam placement
- fabricator approval

Stone-industry nesting is not just packing rectangles into a slab. Avoid over-promising.

Material gating matters. A slab optimiser should:

- skip standalone pieces with no material
- allow attached WF/SB children to inherit parent material intentionally
- show skipped pieces as warnings so the estimator knows why slab count is incomplete
- preserve group and parent metadata when oversize pieces are split
- visibly mark grain/rotation-locked pieces
- distinguish estimating layout from approved production nesting

Grain matching needs a single coherent model. v2 had disconnected sources: material grain fields, relationship flags, and piece-level flags. v3 should resolve grain from:

- material grain type and whether matching is physically relevant
- relationship-level continuity requirements
- explicit user override
- AI extraction evidence when the drawing specifies bookmatching/vein direction

Uniform materials should not force grain constraints merely because a waterfall exists. Veined materials should make the constraint explicit and visible.

Segment display is not optional. If an oversized piece is split, the UI should show:

- original parent piece
- segment count
- each segment dimension
- slab assignment for each segment
- join count and join length
- whether a segment is below preferred fabricable size

This avoids the common v2 confusion where a split piece looks like several unrelated parts.

## UX Recommendations

Quote creation should start with one raw quote workspace, then let the user choose the input mode inside it:

- manual
- template
- drawing import
- unit/block schedule

This avoids fragmenting the workflow and makes corrections easier. The user should always land in the same reviewable quote truth surface.

For AI import, the UI should clearly show:

- what was extracted
- what is uncertain
- what changed the price
- what needs review before finalising

For edge editing, show separate controls for:

- visible profile
- build-up construction
- wall/attached status
- charge behaviour

## Northcoast / Acrual Comparison Learnings

The most valuable comparison is not just total vs total. The useful structure is:

- NCS total excl GST
- v3 calculated total excl GST
- variance amount
- variance percentage
- material variance
- cutting variance
- profile/edge labour variance
- cutout variance
- install/delivery variance
- manual/override variance
- notes on likely cause

Some NCS quotes may contain inconsistent or judgement-based pricing. v3 should be able to model consistent rules first, then represent deviations through explicit overrides.

When importing Acrual/NCS examples into training or validation, keep three separate comparisons:

- NCS customer quote total and visible notes
- NCS internal item build-up by charge category
- Stonehenge calculated quote from structured pieces and settings

Do not use customer quote PDFs alone as exact truth when internal build-up is available. The customer-facing number may include judgement, rounding, package decisions, or manual adjustment not visible on the PDF.

## Source Documents Worth Reusing

The Claude project folders contain several high-value references that should be treated as project memory, not background noise:

- `STONEHENGE-V2-COMPREHENSIVE-ANALYSIS.md`
- `PIECE-RULES-DEEP-REVIEW-v2.md`
- `Drawing-AI-Reader-Audit-and-Fixes-2026-05-05.md`
- `Slab-Optimizer-Comprehensive-Audit-2026-04-09.md`
- `V3-MASTER-BIBLE-REVISED.md`
- `STONEHENGE-V3-STONE-DOMAIN-ARCHITECTURE.md`
- `stonehenge-v4/docs/contracts/*`
- `stonehenge-v4/packages/core/*`

Before rebuilding or changing core quote logic, read these first. A lot of apparent bugs in v2 are already named there, including the reasons behind them.

## Launch Principle

Make quote truth explicit, auditable, and boring.

The magic should live in workflow, AI assistance, and usability. The saved quote model and calculation engine should be simple enough that mistakes have nowhere to hide.
