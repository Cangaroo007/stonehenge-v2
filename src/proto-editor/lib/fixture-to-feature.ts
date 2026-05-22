// apps/web/src/lib/fixture-to-feature.ts
//
// Convert a V3 catalogue entry + edge placement into one or more Features.
//
// Pure module — no React, no Konva, no Next.js.
//
// Round 2 — fixture catalogue. The picker hands us (1) the V3 entry the
// operator selected, (2) a `FeaturePlacement` from the placement model,
// and (3) the active piece. We produce:
//
//   - One primary feature for the entry (sink/cooktop/tap-hole at the
//     placement position with manufacturer dimensions)
//   - Zero or more accessory features (e.g. tap holes auto-placed behind
//     a sink when `entry.bench_holes[i].purpose === "tap"`)
//
// Sinks in the V3 catalogue today carry the sink cutout in `entry.cutout`
// and have no `bench_holes` — taps are a separate fixture type, picked
// independently. So in practice the auto-tap-hole code path is dormant
// with current V3 data; it stays in to future-proof against schema
// iterations that bundle taps with sinks.
//
// "Custom dimensions" is a separate path — `customDimensionsToFeature`
// builds a feature without a catalogue lookup, keyed off the operator's
// numeric inputs. No `FixtureMetadata.catalogueEntryId` is set.

import { featureId } from "@stonehenge-proto/geometry";
import type {
  EdgeProfile,
  Feature,
  FeatureId,
  Piece,
} from "@stonehenge-proto/geometry";

import type {
  PrototypeFeatureKind,
  V3CatalogueEntry,
  V3RectangularCutout,
} from "./catalogue";
import {
  computeFeaturePosition,
  edgeInwardNormal,
  featureBboxMm,
  featureFitsInPiece,
} from "./feature-placement";
import type { FeaturePlacement, FixtureMetadata } from "../types/editor";

// ─────────────────────────────────────────────────────────────────────────
// Round 8A (FIX 1) — default cutout edge profile by feature kind.
//
//   undermount-sink  → pencil-round  (visible edge — must be finished)
//   overmount-sink   → raw           (sink lip covers the edge)
//   cooktop-cutout   → raw           (cooktop rim covers the edge)
//   tap-hole         → raw           (drilled hole, no edge profile)
//   window-recess    → raw           (recess back-edge handled elsewhere)
//
// Per Gate 0 UNCERTAIN-4 [A]: we key on `Feature["kind"]` only. The brief's
// `installationType` parameter is redundant — the kind already discriminates
// undermount vs overmount vs cooktop. Future operator overrides flow
// through the metadata (`cutoutEdgeProfile` is an optional field on
// FixtureMetadata) rather than through this floor.
//
// Exported for the perimeter-line-item builder in `useQuote.ts` and for
// direct test coverage in `cutout-edge-profile.test.ts`.
// ─────────────────────────────────────────────────────────────────────────

export function defaultCutoutEdgeProfile(
  kind: PrototypeFeatureKind,
): EdgeProfile {
  if (kind === "undermount-sink") return "pencil-round";
  return "raw";
}

/**
 * Round 8A (FIX 1) — cutout perimeter in millimetres, used by the
 * `useQuote` layer to bill cutout edge profiling. Rectangular cutouts use
 * `2 × (width + depth)`; circular cutouts (tap holes, future round
 * sinks) use `π × diameter`.
 *
 * Tap holes resolve to `"raw"` via `defaultCutoutEdgeProfile`, so their
 * perimeter is never billed today — but the formula stays correct for
 * future overrides.
 */
export function cutoutPerimeterMm(feature: Feature): number {
  switch (feature.kind) {
    case "undermount-sink":
      return 2 * (feature.bowlWidthMm + feature.bowlDepthMm);
    case "overmount-sink":
      return 2 * (feature.cutoutWidthMm + feature.cutoutDepthMm);
    case "cooktop-cutout":
      return 2 * (feature.cutoutWidthMm + feature.cutoutDepthMm);
    case "tap-hole":
      return Math.PI * feature.diameterMm;
    case "window-recess":
      return 2 * (feature.widthMm + feature.intrusionMm);
    case "custom-cutout": {
      // Sum of straight-edge segments around the outline.
      let total = 0;
      const pts = feature.outline;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        total += Math.hypot(b.x - a.x, b.y - a.y);
      }
      return total;
    }
    default: {
      const _exhaustive: never = feature;
      return _exhaustive;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────

export interface FixturePlacementResult {
  /**
   * Features to dispatch to the reducer. One element for a typical
   * sink/cooktop/tap; two when a sink ships with a tap bench-hole and the
   * auto-tap-hole position fits inside the piece.
   */
  readonly features: readonly Feature[];
  /**
   * Per-feature placement entries to record alongside the features. Indexed
   * by FeatureId.
   */
  readonly placements: ReadonlyMap<FeatureId, FeaturePlacement>;
  /**
   * Per-feature catalogue metadata. Only the primary feature gets a
   * non-null `catalogueEntryId`; accessory tap holes get an entry pointing
   * at the parent sink's catalogue id (so the operator can trace the
   * association).
   */
  readonly fixtureMetadata: ReadonlyMap<FeatureId, FixtureMetadata>;
  /**
   * Warning surface. The brief calls for a toast when an auto-placed tap
   * hole would fall outside the piece — we set this flag and the UI
   * decides what to show.
   */
  readonly warnings: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────
// V3 entry → primary feature dimensions
// ─────────────────────────────────────────────────────────────────────────

interface PrimaryDimensions {
  readonly widthMm: number;
  readonly depthMm: number;
  readonly cornerRadiusMm: number;
}

function primaryDimensionsFromEntry(
  entry: V3CatalogueEntry,
  kind: PrototypeFeatureKind,
): PrimaryDimensions | null {
  // Tap-hole kind always uses a circular cutout — diameter doubles for
  // both width and depth in `featureBboxMm`.
  if (kind === "tap-hole") {
    if (entry.cutout?.shape === "circle") {
      return {
        widthMm: entry.cutout.diameter_mm,
        depthMm: entry.cutout.diameter_mm,
        cornerRadiusMm: 0,
      };
    }
    // Some tap-mixers carry a rectangular cutout (rare). Fall back to the
    // bench_holes diameter if present, otherwise reject.
    if (entry.bench_holes && entry.bench_holes.length > 0) {
      const first = entry.bench_holes[0]!;
      return {
        widthMm: first.diameter_mm,
        depthMm: first.diameter_mm,
        cornerRadiusMm: 0,
      };
    }
    return null;
  }

  // Sinks + cooktops use a rectangular cutout. V3 schema:
  //   length_mm = long axis (parallel to bench front)
  //   width_mm  = short axis (front-to-back, i.e. depth in placement terms)
  if (entry.cutout?.shape === "rectangle") {
    const rect = entry.cutout;
    return {
      widthMm: rect.length_mm,
      depthMm: rect.width_mm,
      cornerRadiusMm: rect.corner_radius_mm ?? 0,
    };
  }

  // Custom-shape entries (rare, e.g. oval cutouts) — fall back to the
  // bounding box. Rendering loses the shape but the placement is correct.
  if (entry.cutout?.shape === "custom") {
    return {
      widthMm: entry.cutout.bounding_box_mm.length,
      depthMm: entry.cutout.bounding_box_mm.width,
      cornerRadiusMm: 0,
    };
  }

  // Template-supplied entries with no numeric cutout: we cannot place them
  // accurately. The picker filters these out with a "Template required"
  // warning, but if one slips through, reject.
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Build a primary feature (no position yet — reducer recomputes from
// placement). Position is set to placement reference for the call to
// `featureFitsInPiece` and is overwritten when the reducer commits.
// ─────────────────────────────────────────────────────────────────────────

function buildPrimaryFeature(
  kind: PrototypeFeatureKind,
  dims: PrimaryDimensions,
): Feature {
  const id = featureId();
  const zero = { x: 0, y: 0 } as const;
  switch (kind) {
    case "undermount-sink":
      return {
        id,
        kind: "undermount-sink",
        position: zero,
        bowlWidthMm: dims.widthMm,
        bowlDepthMm: dims.depthMm,
      };
    case "overmount-sink":
      return {
        id,
        kind: "overmount-sink",
        position: zero,
        cutoutWidthMm: dims.widthMm,
        cutoutDepthMm: dims.depthMm,
      };
    case "cooktop-cutout":
      return {
        id,
        kind: "cooktop-cutout",
        position: zero,
        cutoutWidthMm: dims.widthMm,
        cutoutDepthMm: dims.depthMm,
        cornerRadiusMm: dims.cornerRadiusMm,
      };
    case "tap-hole":
      return {
        id,
        kind: "tap-hole",
        position: zero,
        diameterMm: dims.widthMm, // diameter — width = depth for taps
      };
    case "window-recess": {
      // The picker doesn't surface window-recess via the catalogue (no
      // products), but the kind is in the union — keep exhaustiveness.
      return {
        id,
        kind: "window-recess",
        position: zero,
        widthMm: dims.widthMm,
        depthMm: dims.depthMm,
        intrusionMm: dims.depthMm,
      };
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Auto-place tap holes for a sink with `bench_holes` of purpose "tap".
//
// Geometry: the tap sits further inward (toward the wall) than the sink.
// Its centre lies on the same reference edge, at the same
// `offsetAlongEdgeMm` as the sink's centre, but at a larger
// `offsetInwardMm`:
//
//   tap.outerFace = sink.outerFace + sinkDepthMm + tapOffsetMm - tapDiameter/2
//   tap.offsetInwardMm = sink.offsetInwardMm + sinkDepthMm + tapOffsetMm - tapDiameter/2
//
// where `tapOffsetMm` is V3's `bench_hole.offset_mm` — distance from sink
// far edge to tap centre. We default to 80mm (the brief's standard) when
// the bench_hole omits it.
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_TAP_OFFSET_FROM_SINK_MM = 80;

interface TapHoleAttempt {
  readonly feature: Feature;
  readonly placement: FeaturePlacement;
}

function buildTapHoleAttempts(
  sinkPlacement: FeaturePlacement,
  sinkDepthMm: number,
  entry: V3CatalogueEntry,
): readonly TapHoleAttempt[] {
  if (!entry.bench_holes || entry.bench_holes.length === 0) return [];
  const attempts: TapHoleAttempt[] = [];
  for (const hole of entry.bench_holes) {
    if (hole.purpose !== "tap") continue;
    const tapOffsetMm = hole.offset_mm ?? DEFAULT_TAP_OFFSET_FROM_SINK_MM;
    const tapDiameterMm = hole.diameter_mm;
    const tapInward =
      sinkPlacement.offsetInwardMm +
      sinkDepthMm +
      tapOffsetMm -
      tapDiameterMm / 2;
    const tapPlacement: FeaturePlacement = {
      referenceEdgeId: sinkPlacement.referenceEdgeId,
      offsetAlongEdgeMm: sinkPlacement.offsetAlongEdgeMm,
      offsetInwardMm: tapInward,
    };
    attempts.push({
      feature: {
        id: featureId(),
        kind: "tap-hole",
        position: { x: 0, y: 0 },
        diameterMm: tapDiameterMm,
      },
      placement: tapPlacement,
    });
  }
  return attempts;
}

// ─────────────────────────────────────────────────────────────────────────
// Position a feature using `computeFeaturePosition`. Returns the feature
// with its `position` updated to the placement-derived centre. Used both
// as a sanity step for the caller AND so the reducer's downstream
// `featureFitsInPiece` checks (which use `feature.position` indirectly
// via bbox) get the right values.
// ─────────────────────────────────────────────────────────────────────────

function withPlacementPosition(
  piece: Piece,
  feature: Feature,
  placement: FeaturePlacement,
): Feature | null {
  const { depthMm } = featureBboxMm(feature);
  const pos = computeFeaturePosition(piece, placement, depthMm);
  if (!pos) return null;
  return { ...feature, position: { x: pos.centreX, y: pos.centreY } };
}

// ─────────────────────────────────────────────────────────────────────────
// Public API — fixtureToFeatures
// ─────────────────────────────────────────────────────────────────────────

export interface FixtureToFeaturesInput {
  readonly entry: V3CatalogueEntry;
  readonly kind: PrototypeFeatureKind;
  readonly placement: FeaturePlacement;
  readonly piece: Piece;
}

/**
 * Convert a catalogue selection into Features. Returns null if the
 * primary feature can't be built (e.g. template-supplied entry with no
 * numeric cutout, or a tap-mixer with neither a circular cutout nor
 * bench_holes). Returns a result with `warnings` non-empty when the
 * primary fits but an accessory tap hole doesn't.
 */
export function fixtureToFeatures(
  input: FixtureToFeaturesInput,
): FixturePlacementResult | null {
  const { entry, kind, placement, piece } = input;

  const dims = primaryDimensionsFromEntry(entry, kind);
  if (!dims) return null;

  const primaryRaw = buildPrimaryFeature(kind, dims);
  const primary = withPlacementPosition(piece, primaryRaw, placement);
  if (!primary) return null;

  if (!featureFitsInPiece(piece, placement, dims.widthMm, dims.depthMm)) {
    return null;
  }

  const features: Feature[] = [primary];
  const placements = new Map<FeatureId, FeaturePlacement>();
  placements.set(primary.id, placement);

  const fixtureMetadata = new Map<FeatureId, FixtureMetadata>();
  fixtureMetadata.set(primary.id, metadataFromEntry(entry, kind));

  const warnings: string[] = [];

  // Tap-hole accessory placement (sinks only — kind === "tap-hole" is the
  // tap itself, not a sink with a tap-hole bench_hole).
  if (kind === "undermount-sink" || kind === "overmount-sink") {
    const tapAttempts = buildTapHoleAttempts(placement, dims.depthMm, entry);
    for (const attempt of tapAttempts) {
      const tapBbox = featureBboxMm(attempt.feature);
      const tapFits = featureFitsInPiece(
        piece,
        attempt.placement,
        tapBbox.widthMm,
        tapBbox.depthMm,
      );
      if (!tapFits) {
        warnings.push(
          `Couldn't auto-place tap hole — position it manually.`,
        );
        continue;
      }
      const positioned = withPlacementPosition(
        piece,
        attempt.feature,
        attempt.placement,
      );
      if (!positioned) continue;
      features.push(positioned);
      placements.set(positioned.id, attempt.placement);
      // The tap's catalogue metadata points back to the parent sink so the
      // operator can trace which sink it was auto-placed for. The tap-hole
      // resolves to a "raw" default cutout profile (drilled hole).
      fixtureMetadata.set(positioned.id, metadataFromEntry(entry, "tap-hole"));
    }
  }

  return { features, placements, fixtureMetadata, warnings };
}

// ─────────────────────────────────────────────────────────────────────────
// "Custom dimensions" path — no catalogue lookup. The picker's bottom card
// opens an input form and dispatches via this function instead of
// `fixtureToFeatures`. No metadata is recorded other than `null` ids.
// ─────────────────────────────────────────────────────────────────────────

export interface CustomDimensionsInput {
  readonly kind: PrototypeFeatureKind;
  readonly placement: FeaturePlacement;
  readonly piece: Piece;
  readonly widthMm: number;
  readonly depthMm: number;
  readonly cornerRadiusMm?: number;
}

/**
 * Build a single feature from operator-entered dimensions. Returns null if
 * the dimensions don't fit at the placement.
 */
export function customDimensionsToFeature(
  input: CustomDimensionsInput,
): FixturePlacementResult | null {
  const { kind, placement, piece, widthMm, depthMm, cornerRadiusMm } = input;
  const dims: PrimaryDimensions = {
    widthMm,
    depthMm,
    cornerRadiusMm: cornerRadiusMm ?? 0,
  };
  const featureRaw = buildPrimaryFeature(kind, dims);
  const feature = withPlacementPosition(piece, featureRaw, placement);
  if (!feature) return null;
  if (!featureFitsInPiece(piece, placement, widthMm, depthMm)) return null;

  const placements = new Map<FeatureId, FeaturePlacement>([
    [feature.id, placement],
  ]);
  const fixtureMetadata = new Map<FeatureId, FixtureMetadata>([
    [
      feature.id,
      {
        catalogueEntryId: null,
        brand: null,
        model: null,
        mountType: null,
        cutoutTemplateSupplied: false,
        cutoutEdgeProfile: defaultCutoutEdgeProfile(kind),
      },
    ],
  ]);
  return {
    features: [feature],
    placements,
    fixtureMetadata,
    warnings: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function metadataFromEntry(
  entry: V3CatalogueEntry,
  kind: PrototypeFeatureKind,
): FixtureMetadata {
  return {
    catalogueEntryId: entry.id,
    brand: entry.brand,
    model: entry.model,
    mountType: entry.mount_type,
    cutoutTemplateSupplied: entry.cutout_template_supplied === true,
    cutoutEdgeProfile: defaultCutoutEdgeProfile(kind),
  };
}

// Re-export for callers that want type-narrowed cutout shapes.
export type { V3RectangularCutout };
