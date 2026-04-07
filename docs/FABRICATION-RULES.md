# STONEHENGE — FABRICATION RULES
## Version: 1.0 — April 7, 2026
## Status: LOCKED — Jay Henderson confirmed
## Location: docs/FABRICATION-RULES.md (permanent — never expires)
## Authority: This document supersedes all session handoff documents on domain rules.
## Update protocol: Any change requires Jay confirmation + same-PR update.

---

> This document captures every domain rule Jay Henderson has confirmed about
> stone fabrication, pricing, and physical reality. It is the single source
> of truth for all calculator, optimizer, and UI logic. Every sprint that
> touches pricing or fabrication logic MUST read this document at Gate 0.

---

## PART 1 — PIECE TYPES AND WHAT THEY ARE

### 1.1 Benchtop / Countertop / Worktop
- The primary piece. Always has its own slab allocation.
- Terminology varies by market (AU: benchtop, US: countertop, UK: worktop).
- Always priced with material + cutting + edge profiles + installation.

### 1.2 Waterfall Panel
- A separate stone piece — vertical drop from benchtop edge to floor.
- ALWAYS its own stone piece with its own slab allocation.
- NEVER an edge type. NEVER part of the benchtop piece.
- Has its own material cost (inherits parent material if no material assigned).
- Has its own installation cost (area × installation rate).
- Has its own cutting cost (full perimeter).

### 1.3 Splashback / Backsplash
- A separate stone piece — wall panel behind benchtop.
- ALWAYS its own stone piece with its own slab allocation.
- NEVER an edge type. NEVER part of the benchtop piece.
- Has its own material cost (inherits parent material if no material assigned).
- Has its own installation cost (area × installation rate).
- Has its own cutting cost (full perimeter).
- No dedicated service rate — priced as standard stone.

### 1.4 Strips (Face Strip, Return Strip, Support Block)
- NOT pieces. Auto-generated from build-up configuration.
- Cut from the SAME slab as the parent piece.
- No separate material cost — included in parent slab.
- Labels: Part B = front strip, Part C = return strip, Part D = support block.

### 1.5 Island
- A benchtop that is freestanding — finished on all visible sides.
- Priced identically to a benchtop.
- NOT a relationship type.

---

## PART 2 — MATERIAL COST RULES

### 2.1 Material inheritance
- WF/SB pieces that have no material_id assigned ALWAYS inherit the primary
  material from their parent benchtop.
- They get their OWN slab allocation — not shared with the parent.
- Their area is included in the total area for proportional slab cost distribution.

### 2.2 Slab cost allocation
- Slab cost is distributed proportionally across ALL pieces by area.
- This includes WF/SB pieces (with inherited material).
- Formula: piece_material_cost = (piece_area / total_area) × total_slab_cost

### 2.3 Pricing basis
- Northcoast Stone: PER_SLAB.
- Slab count comes from the optimizer when run; estimated from area otherwise.

---

## PART 3 — CUTTING RULES

### 3.1 Full perimeter always cut
- Every piece has its full perimeter cut — no exceptions.
- Wall edges DO NOT suppress cutting. Only strips and polishing are suppressed.
- WF/SB pieces: full perimeter cut.
- Formula: cutting_cost = perimeter_Lm × cutting_rate_per_Lm

### 3.2 Strip threshold
- Pieces with minimum dimension < 300mm are classified as strips.
- Default threshold: 300mm (configurable per tenant via pricing settings).
- Mason can override strip classification on a per-piece basis.

### 3.3 Oversize pieces
- Pieces longer than one slab require joins.
- Join is charged per linear metre at the JOIN service rate.
- L/U shapes: each leg checked independently against slab dimensions.

---

## PART 4 — EDGE PROFILE RULES

### 4.1 Standard edge pricing
- Each finished edge is charged: edge_length_Lm × edge_rate_per_Lm.
- Rate depends on edge profile type and material fabrication category.
- Raw edges: $0.

### 4.2 Wall edges
- Wall edges suppress: strips (lamination), polishing of strips.
- Wall edges DO NOT suppress: cutting, edge profile charge on the benchtop face.
- Wall edges are user-designated — the stone mason explicitly marks an edge as wall.
- Wall edge designation is INDEPENDENT of WF/SB attachment.
- An edge can simultaneously be a wall edge AND have a WF/SB attached.

### 4.3 Mitered edge — CRITICAL RULE
- When a waterfall is attached to a benchtop edge:
  - The benchtop edge WHERE THE WATERFALL ATTACHES must be Mitered.
  - The waterfall edge that attaches to the parent piece must ALSO be Mitered.
  - BOTH edges are charged the Mitered edge rate.
  - This is non-negotiable physics — the miter joint is the attachment method.
- Other edges on the waterfall (top, bottom, opposite side) can have any
  profile or build-up the mason chooses.
- Mitered edge always generates: front strip (Part B) + return strip (Part C).

### 4.4 Strip suppression on WF/SB-attached edges
- When a WF/SB is attached to a benchtop edge, strips are suppressed on
  that benchtop edge automatically.
- Reason: the waterfall covers that edge face — no strip is needed.
- This suppression is INDEPENDENT of wall edge designation.
- Both suppressions can apply simultaneously (wall AND WF/SB-attached edge).
- The edge profile charge (Mitered rate) still applies — suppression only
  affects strips, not the edge profile cost.

### 4.5 Build-up rules
- Build-up applies when thickness appearance > slab thickness.
- 40mm appearance = 20mm slab + strips.
- Build-up is BLOCKED on wall edges (no visible face to build up).
- Mitered edge requires build-up — they are linked.
- Toggling build-up ON auto-sets edge profile to Mitered.
- Toggling build-up OFF resets to Raw.

---

## PART 5 — INSTALLATION RULES

### 5.1 Installation rate
- Charged per square metre of stone area.
- Applies to ALL pieces: benchtops, waterfalls, splashbacks, islands.
- Each piece gets its own installation cost based on its own area.
- Formula: installation_cost = piece_area_sqm × installation_rate

### 5.2 Minimum charge
- Installation has a minimum charge per quote (not per piece).
- If total installation cost < minimum, minimum applies.

---

## PART 6 — WATERFALL SPECIFIC RULES

### 6.1 Physical reality
- A waterfall is a vertical stone panel.
- It drops from the benchtop edge to the floor.
- It is cut from the SAME slab as the parent benchtop for grain matching.
- Grain continuity is achieved by positioning adjacent on the slab.

### 6.2 Grain matching
- Waterfall MUST be cut from the same slab as its parent benchtop.
- The optimizer must co-locate them (groupId constraint).
- Grain matching surcharge applies when requiresGrainMatch = true.

### 6.3 Waterfall dimensions
- Width = benchtop depth (the edge it drops from).
- Height = floor-to-benchtop-underside (the drop).
- These are entered as length_mm × width_mm in the system.

### 6.4 Waterfall end charge
- REMOVED from pricing (March 2026 decision).
- No WATERFALL_END service charge is applied.

---

## PART 7 — SPLASHBACK SPECIFIC RULES

### 7.1 Physical reality
- A splashback is a horizontal stone panel fixed to the wall.
- It sits on top of the benchtop (bottom edge rests on benchtop surface).
- Typically 100-150mm tall, full width of the benchtop run.

### 7.2 Partial coverage
- A splashback may cover only part of the benchtop back edge.
- Position and coverage are stored (position_mm from left, coverage_mm).
- The uncovered portion of the back edge may still need strips/polishing.

### 7.3 Pricing
- No dedicated service rate — priced as standard stone.
- Material, cutting, edges, installation all apply normally.

---

## PART 8 — U-SHAPE AND L-SHAPE RULES

### 8.1 Geometry
- U-shape: three rectangles (left leg, back, right leg) sharing a flat bottom.
- L-shape: two rectangles (leg 1, leg 2) sharing a corner.
- Back inner edge of U-shape is always horizontal.
- Leg tops may be at different heights (unequal legs).

### 8.2 Slab allocation
- Each leg is checked independently against slab dimensions.
- If a leg fits on one slab, no join needed for that leg.
- If a leg is oversize, it is split into segments with a join.

### 8.3 Corner join
- Where legs meet, a corner join is required.
- L-shape: 1 corner join, length = min(leg1_width, leg2_width).
- U-shape: 2 corner joins, each = back_width.
- Corner join charged at JOIN service rate per linear metre.

### 8.4 Strip generation
- Strips generated using ACTUAL outer edge lengths — not bounding box.
- Inner edges (where legs meet) do NOT get strips — these are join faces.

---

## PART 9 — OPTIMIZER RULES

### 9.1 Piece inclusion
- ALL pieces must be included in the optimizer: benchtops, WF, SB, L/U shapes.
- Pieces without material_id inherit the primary material for placement.

### 9.2 Grain co-placement
- WF/SB pieces must be co-located with their parent on the same slab.
- This is enforced via groupId in the optimizer.

### 9.3 L/U shape decomposition
- L/U shapes are decomposed into component rectangles before optimization.
- Each rectangle is placed independently but grouped (same slab).

---

## PART 10 — DATA INTEGRITY RULES

### 10.1 noStripEdges field — DUAL PURPOSE (known issue)
- `noStripEdges` stores BOTH wall edges AND WF/SB-attached edges.
- Wall edges: user-designated, suppress strips and polishing.
- WF/SB-attached: system-written, suppress strips only.
- Calculator correctly uses this field for strip suppression.
- UI must use `attachedPieceTypes` to distinguish wall vs WF/SB-attached.
- Long-term fix: separate `wall_edges` field (schema change, not yet done).

### 10.2 Material inheritance chain
- If piece.material_id is null → use primary material from quote.
- Primary material = first piece with materials in allPieces array.
- WF/SB always appear after their parent benchtop in allPieces.

### 10.3 Pricing calculator field access
- `no_strip_edges`: used for strip suppression (wall + WF/SB).
- `edge_buildups`: per-edge build-up config, drives strip generation.
- `lamination_method`: legacy field, superseded by edge_buildups.
- `requiresGrainMatch`: drives grain matching surcharge.

---

## APPENDIX — CONFIRMED ANSWERS (Jay Henderson, locked)

| # | Question | Answer | Date |
|---|----------|--------|------|
| 1 | Wall edge suppress cutting? | NO — full perimeter always cut | Mar 2026 |
| 2 | WF/SB material | Inherit parent, own slab allocation | Apr 2026 |
| 3 | WF/SB installation | Each piece × own area × standard rate | Apr 2026 |
| 4 | WF/SB cutting | Full perimeter | Apr 2026 |
| 5 | WF/SB edge profiles | Normal — each finished edge × profile rate × length | Apr 2026 |
| 6 | Mitered edge on WF attachment | BOTH benchtop AND waterfall edge must be Mitered, both charged | Apr 2026 |
| 7 | Strip suppression on WF edge | YES — waterfall covers the benchtop edge face | Apr 2026 |
| 8 | Wall + WF/SB simultaneously | YES — both can apply independently on same edge | Apr 2026 |
| 9 | Build-up on wall edges | BLOCKED — no visible face | Mar 2026 |
| 10 | Strip threshold | 300mm (Northcoast default) | Apr 2026 |
| 11 | Waterfall end charge | REMOVED — not charged | Mar 2026 |
| 12 | Grain match: WF same slab | YES — mandatory for grain continuity | Apr 2026 |
| 13 | U-shape flat bottom | YES — all legs share flat bottom at y + max(leg heights) | Apr 2026 |
| 14 | Corner join L-shape | min(leg1_width, leg2_width) in Lm at JOIN rate | Apr 2026 |
| 15 | Corner join U-shape | back_width × 2 in Lm at JOIN rate | Apr 2026 |
