# V4 Spatial Geometry Positioning Brief

Date: 2026-05-22

## Summary

Do not position the current geometry import/tooling as "LiDAR" unless the feature is specifically capturing or consuming true phone/site LiDAR scan data.

The v2 feature that had been labelled "LiDAR" is currently a spatial geometry bridge: it imports structured countertop geometry, polygon vertices, wall-edge hints, cutout/appliance hints, and edge finish metadata into quote pieces. It is useful and important, but it is not the AI drawing reader and it is not a complete iPhone LiDAR scanner workflow.

## Recommended Product Language

Use:

- Spatial Geometry
- Geometry Import
- Spatial Import
- Manual / Scan Geometry
- Polygon Geometry Review
- Site Measure / Trace Review

Avoid:

- LiDAR Import
- LiDAR Proto
- LiDAR Scanner

Use "LiDAR" only for a future flow that actually receives iPhone/iPad LiDAR scan capture or an equivalent site-scan data source.

## Product Model

V4 should treat these as separate but connected flows:

1. AI Drawing Reader
   - Input: PDFs, images, joinery drawings, construction plans, marked sketches.
   - Output: extracted quote candidates, pieces, materials, dimensions, cutouts, edge assumptions, uncertainty, and questions.
   - User posture: "Upload drawings and let AI interpret them."

2. Spatial Geometry / Polygon Review
   - Input: manually traced geometry, site measure data, structured scan JSON, future LiDAR scan output, or AI-generated polygon proposals.
   - Output: canonical polygon piece geometry with stable vertex IDs, stable edge IDs, edge metadata, cutout/features, area, perimeter, and edge lengths.
   - User posture: "Review and correct the exact piece geometry before pricing/manufacture."

3. Future LiDAR Capture
   - Input: actual mobile LiDAR/site scan capture.
   - Output: proposed room geometry, countertop polygons, wall/contact edges, appliances, cutouts, and site constraints.
   - User posture: "Capture the site and convert it into quote-ready geometry."

## Key Positioning Decision

The geometry primitive is the core, not LiDAR.

LiDAR is one possible data source. Drawings, manual tracing, uploaded JSON, and AI extraction are also data sources. All of them should land in the same canonical polygon model.

## Why This Matters

Calling the current page "LiDAR" confused users because they expected to upload PDF drawings and have the AI reader interpret them. In reality, the page was for structured geometry JSON and prototype fixtures.

That confusion creates the wrong mental model:

- User sees "LiDAR" and expects scanner/drawing magic.
- Product currently accepts geometry JSON.
- The actual PDF workflow lives in "Import Drawing".

V4 should make the entry points explicit.

## Suggested V4 Navigation

Inside a quote:

- Import Drawing
  - Upload PDF/image
  - AI reads scope
  - Review extracted pieces
  - Send uncertain geometry to spatial review

- Geometry Review
  - Edit polygon pieces
  - Check dimensions, edges, wall edges, build-ups, cutouts
  - Confirm quote-ready geometry

- Import Site Scan
  - Future/optional
  - Only use this label when scan capture exists

## Canonical Data Rule

Every geometry-producing flow should land in the same canonical polygon primitive:

- vertices in mm coordinates
- stable vertex IDs
- stable edge IDs
- outer ring
- inner rings/features
- edge lengths
- area
- perimeter
- edge profile/finish/exposure metadata
- cutouts/features as structured objects

Do not let drawing imports, manual edits, or future LiDAR imports create separate rectangle placeholders or detached geometry state.

## UX Copy Example

For a geometry import page:

Title: Spatial Geometry Import

Helper copy:
"Import structured countertop geometry into this quote as normal pieces. This is for scan/manual-trace JSON and prototype fixtures. To upload PDFs or images, use Import Drawing."

Primary actions:

- Import Drawing PDF
- Import Geometry JSON
- Back to Quote

## V4 Implementation Notes

- Keep the AI drawing reader and geometry review visually connected, but do not collapse them into the same mental step.
- The AI reader should be allowed to produce partial/uncertain geometry proposals.
- Human review should be required before complex polygons become quote-final.
- Future LiDAR capture should feed the same geometry adapter, not a separate pricing path.
- Pricing should always read area/perimeter/edge lengths from the canonical polygon snapshot when it exists.

