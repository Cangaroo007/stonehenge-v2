// apps/web/src/lib/colour-map.ts
//
// Edge-profile and edge-exposure visual mapping for the canvas.
//
// ─────────────────────────────────────────────────────────────────────────
// Audit ↔ Phase 1 vocabulary alias map (Phase 2A audit UNCERTAIN-1 [A])
// ─────────────────────────────────────────────────────────────────────────
//
// The audit body uses a few descriptive aliases that do not exist in the
// Phase 1 `EdgeExposure` type. We normalise at the editor boundary; V3
// fold-back will retire these aliases.
//
//   Audit alias        →   Canonical EdgeExposure literal
//   ───────────────        ───────────────────────────────
//   against-wall       →   wall
//   against-piece      →   join
//   against-appliance  →   concealed
//
// This file does not import the alias names; consumers operate on the
// canonical literals. The mapping is documented here so the discrepancy is
// discoverable from one place.

import type { EdgeExposure, EdgeProfile } from "@stonehenge-proto/geometry";

/**
 * Edge profile → stroke colour, keyed off the canonical Phase 1 literal.
 * The cinnabar accent is reserved for `mitre-45` because mitred edges are
 * always the most expensive, most considered choice on a stone job.
 */
export const PROFILE_COLOURS: Readonly<Record<EdgeProfile, string>> = {
  raw: "#75746B", // stone-500
  "pencil-round": "#4A90D9", // canvas.selection blue
  "half-bullnose": "#5DCAA5", // teal
  "full-bullnose": "#1D9E75", // teal-dark
  bevel: "#EF9F27", // amber
  ogee: "#D85A30", // coral
  dupont: "#D4537E", // pink
  "mitre-45": "#D63F1A", // cinnabar
};

/**
 * Stroke dash pattern per exposure. `exposed` is solid; everything else
 * carries a stroke pattern so the operator can see-at-a-glance which edges
 * are billable for profiling.
 *
 * Phase 1 calc only bills `exposure === "exposed"` edges; the visual
 * distinction lets the operator reason about why an edge isn't priced.
 */
export const EXPOSURE_DASH: Readonly<Record<EdgeExposure, readonly number[]>> =
  {
    exposed: [], // solid
    wall: [6, 4], // dashed — abuts a wall
    join: [2, 4], // dotted — joined to another piece
    concealed: [10, 3, 2, 3], // dash-dot — hidden under appliance/cabinetry
  };

/**
 * Human label for an exposure. Used in the EdgeProfilePanel selector.
 */
export const EXPOSURE_LABEL: Readonly<Record<EdgeExposure, string>> = {
  exposed: "Exposed",
  wall: "Against wall",
  join: "Joined to piece",
  concealed: "Concealed",
};

/**
 * Human label for a profile. Used in the EdgeProfilePanel selector.
 */
export const PROFILE_LABEL: Readonly<Record<EdgeProfile, string>> = {
  raw: "Raw cut",
  "pencil-round": "Pencil round",
  "half-bullnose": "Half bullnose",
  "full-bullnose": "Full bullnose",
  bevel: "Bevel",
  ogee: "Ogee",
  dupont: "DuPont",
  "mitre-45": "45° mitre",
};

/**
 * Material category → swatch tint for the canvas polygon fill. Falls back
 * to a neutral stone tint when the category is unknown.
 */
export function materialCategoryTint(category: string | undefined): string {
  switch (category) {
    case "Engineered":
      return "rgba(232, 234, 230, 0.18)";
    case "Natural":
      return "rgba(220, 196, 168, 0.20)";
    case "Ultra-compact":
      return "rgba(200, 200, 210, 0.16)";
    default:
      return "rgba(225, 224, 217, 0.16)";
  }
}
