# Stonehenge V2 regression harness — Session log 2026-04-30

This log captures the construction of the regression harness and the first
five fixtures, for repo continuity. Authored at the close of Gate 3.

## Harness construction

- `scripts/regression-check.ts` — Node/tsx entry point. Reads fixture JSON,
  resolves quotes by `quoteNumber` or `quoteId`, runs `calculateQuotePrice`,
  emits per-fixture delta rows. Exit 0 if all PASS, 1 if any FAIL/ERROR.
  Read-only against the database.
- `scripts/fixtures/_schema.ts` — `RegressionFixture` and `DeltaReportRow`
  types. Includes the new `expected.ncsImpliedBreakdown` block (Gate 3 Task 0)
  and the `impliedComponentDeltas` informational rows on the report side.
- `scripts/tsconfig.harness.json` — narrow `tsc --noEmit` config covering
  only the harness + schema, so we can typecheck without dragging the rest
  of the app through compilation.
- `scripts/fixtures/example-q00005.json` — self-test fixture. Mirrors V2's
  own breakdown for `Q-00005` (quote 114). Should always PASS; if it FAILs
  the harness itself is broken.
- `scripts/fixtures/_GAP-REPORT.json` / `_GAP-REPORT.md` — generated
  outputs after each run. Markdown report has two tables: the headline
  pass/fail table (sorted by absolute delta), and the new "Implied
  component deltas" table (sorted by fixture then component).

## Q23111 Hudson — extraction findings

### NCS line items table (Gate 2 Task 2A — verbatim)

```
Quote Q23111
Date: 22/04/2026
For: ALL ABOUT KITCHENS
Job: 21 St Martins Tce, Buderim — Law

Item                                                    Amount
Down Stairs Kitchen — 40mm Angled Benchtops             $6,371.95
  Stone: Ambassador Zenith Premium Range
  Includes 1x Undermount Sink, 1x Cooktop cutout

Up Stairs Kitchen — 40mm Angled Benchtops               $8,968.08
  Stone: Ambassador Zenith Premium Range
  Includes 1x Undermount Sink, 1x Cooktop cutout, 1x Waterfall End

Subtotal                                               $15,340.03
GST (10%)                                               $1,534.00
Total inc GST                                          $16,874.03

Note: One pieces of stone in Up Stairs Kitchen flagged
"Possible Join Due to Access" — install-only contingency.
```

### Build-spec from Task 2B (full prose, both kitchens, all 11 pieces)

MATERIAL (both kitchens): Stone Ambassador Zenith Premium Range, 40mm.
EDGE PROFILE: All exposed/visible edges Mitred (the 40mm "Angled Benchtops"
style). Wall-facing edges unfinished. INSTALL: Local install
(Sunshine Coast — Buderim).

KITCHEN 1: DOWN STAIRS — 4 pieces, NCS line item $6,371.95
- Piece D1 — corner/sink piece: 795 × 620 × 40mm. Joined to D2 by an
  angled mitre (drawing shows ~135° obtuse corner, not 90°). 1× undermount
  sink cutout. One long edge is WALL (unfinished); other edges visible
  (mitred).
- Piece D2 — cooktop run: 2476 × 600 × 40mm. Joined to D1 by the same
  angled mitre. 1× cooktop cutout. One long edge is WALL; other edges
  visible (mitred).
- Piece D3 — island bench: 1800 × 900 × 40mm. Standalone rectangle, no
  cutouts. All four edges visible (mitred drop on all faces) — AMBIGUOUS,
  drawing shows hatch marks on 3 of 4 edges; needs Jay to confirm if the
  4th edge is also mitred or against a cabinet.
- Piece D4 — entry benchtop: 2900 × 600 × 40mm. Standalone rectangular
  bench, no cutouts. One long edge labelled WALL (unfinished); other long
  edge + both short edges visible (mitred). "ENTRY" callout on drawing.

Down Stairs totals: 4 pieces, 2 cutouts (1 sink + 1 cooktop), 1 angled
mitre join.

KITCHEN 2: UP STAIRS — 7 pieces, NCS line item $8,968.08
Main run is a U-shape with angled (non-90°) corners around a window bay;
separate small bench has a waterfall end. Quote dims are authoritative for
pricing; drawing labels in red ink ("1965 INTO WINDOW", "750 INTO WINDOW")
are window OPENING sizes, not piece cut sizes.
- Piece U1 — 1000 × 600 × 40mm — AMBIGUOUS, likely cooktop-run end-piece;
  needs Jay to confirm orientation.
- Piece U2 — 855 × 800 × 40mm — AMBIGUOUS, likely angled return at cooktop
  bay (drawing shows "855" near cooktop area).
- Piece U3 — 3020 × 700 × 40mm — "Into Window — Possible Join Due to
  Access" (NCS-flagged: install-only join may be needed onsite due to
  access constraints; price assumes single piece).
- Piece U4 — 790 × 680 × 40mm — Into Window.
- Piece U5 — 1840 × 680 × 40mm — Into Window.
- Piece U6 — 800 × 680 × 40mm — Into Window.
- Piece U7 — 1840 × 700 × 40mm.

Up Stairs features: 1× Waterfall End, 1× Undermount Sink cutout,
1× Cooktop cutout (600mm).
Up Stairs joins: multiple angled mitre joins between U1-U2-U3-U4-U5-U6
around the window bay. Specific edge-by-edge join assignment AMBIGUOUS —
drawing has hatch marks at 4-5 join positions but exact piece-to-piece
pairing needs Jay.

JOB-WIDE TOTALS
Pieces: 11. Cutouts: 4 (2 sink, 2 cooktop). Waterfall ends: 1. Angled
mitre joins: 5-6 (AMBIGUOUS). Total area: Down ~5.69 m², Up ~9.09 m²,
sum ~14.78 m².

### Three observations from Gate 2

1. **Subtotal/discount split is invisible.** The NCS PDF prints only the
   subtotal, GST, and total. There is no `baseSubtotal` and no
   `rulesDiscount` column. The harness was widened so those two fields
   are nullable, and the reconciliation check only fires when both are
   present.
2. **Line-item granularity is room-level.** NCS bundles materials, edges,
   cutouts, and services into one $ figure per kitchen. We cannot
   per-line-item validate against the issued PDF; the only PASS/FAIL
   gate is `totalIncGst`. The new `ncsImpliedBreakdown` block (Gate 3)
   is our workaround — *we* derive the breakdown from drawing geometry +
   Beau's rate sheet + Alpha Surfaces catalog + V2 zone constants.
3. **40mm angled (non-90°) mitre joins are a V3 concept.** V2's
   `PiecePricingBreakdown.cornerJoin` models 90° corner joins only.
   Q23111 Down Stairs has 1 obtuse-angle join; Up Stairs has 4-5.
   Lossy-translation strategy for V2 reconstruction:
   build as separate pieces with butt joins; absorb any geometry gap
   in the headline delta. Confirm with Jay at Gate 4 boundary.

## Customer field discrepancy

Q23111 PDF "For:" reads **"ALL ABOUT KITCHENS"**, not "Hudson Kitchen
Solutions". The string "Hudson Kitchen Solutions" appears only in the
corpus folder name (`Hudson-Kitchen-Solutions/`) and the email forward
metadata. The drawings say "ALL ABOUT KITCHENS / CLIENT - LAW".

Treat the PDF "For:" field as authoritative for `expected.customerName`.
The corpus folder is a curatorial label, not a quote field.

## V2 templating + delivery model surfaced this session

Hardcoded zone constants (live in `src/lib/services/pricing-calculator-v2.ts`):
- Local zone   (0–30 km):   $50 base + $2.50/km
- Regional zone (31–100 km): $75 base + $3.00/km
- Remote zone  (101–500 km): $100 base + $3.50/km
- Templating: $150 base + $2.00/km, only when `templatingRequired = true`

Company HQ: 20 Hitech Drive, KUNDA PARK QLD 4556 (env-overridable via
`COMPANY_ADDRESS`).

The same zone tables are duplicated (whitespace-only diff) in
`src/app/api/distance/calculate/route.ts`. Single-source-of-truth
violation. Post-launch fix; backlogged below.

## Open backlog items surfaced (V2 work, not in scope this session)

1. Per-unit pricing with potentially different materials (spec'd
   previously, not yet built — Q23113 surfaces this need).
2. Unit builder tool (held until core engine stable).
3. Client external reference field on quote — e.g. Q23114 = NCS,
   Q2026-021 = Crafted Interiors internal.
4. Customer modelling — trade installer vs end consumer.
5. `DELIVERY_ZONES` single-source-of-truth — currently duplicated
   between calculator and API route.

## Open questions for Jay

1. Customer modelling — V2 customer = trade installer or end consumer?
2. Angled mitre joins (non-90°) — V3 concept; current V2 strategy:
   build as separate pieces with butt joins (lossy).
3. Drawing edge-profile annotations — too dense to read per-side
   without his interpretation.
4. Are the hardcoded zone rates and templating rate current? When
   were they last reviewed?
5. Is the Kunda Park HQ address still correct?

## Distances per fixture (looked up offline against Google Maps from Kunda Park HQ)

- Q23111: 21 St Martins Tce, Buderim → ~14 km — Local
- Q23112: 25 Surf Rd, Alexandra Headland → ~9 km — Local
- Q23113: 137 Bundilla Blvd, Mountain Creek → ~5 km — Local
- Q23114: Everton Hills, Brisbane → ~95 km — Regional
- Bask: address TBD when extracting the drawing

## Next steps

- Jay builds Q23111–Q23114 in V2 post-launch; the harness then runs and
  reports per-fixture deltas.
- Bask Type A drawing-only fixture validates the inverse-usage shape:
  no NCS-issued quote exists, so the headline gate is sentinel and the
  per-component implied deltas become the validation surface.
- Beau's rate sheet (Quoting Review thread, 2026-01-27) provides the
  `ncsImpliedBreakdown` anchor across all paired fixtures.
