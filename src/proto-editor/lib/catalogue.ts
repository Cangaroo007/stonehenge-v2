// apps/web/src/lib/catalogue.ts
//
// V3 fixture catalogue loader and indexer. Pure module — no React, no Konva.
//
// Architecture (Gate 0 audit, Round 2 — fixture catalogue):
//
//   The catalogue JSON at `data/fixtures.json` is a verbatim copy of the V3
//   research catalogue at
//   `_research/2026-05-07-appliance-catalogue/catalogue.json` — 230 entries
//   across 22 categories with a discriminated-union schema. We intentionally
//   adopt V3's shape so fold-back is `cp data/fixtures.json
//   packages/db/seeds/fixtures.json` (UNCERTAIN-B [A]).
//
//   The prototype only renders 6 feature kinds (sink × undermount/overmount,
//   cooktop, tap-hole, window-recess, custom-cutout). Most V3 categories
//   (downdraft, pop-up power, integrated bin, etc.) have no prototype kind
//   and are filtered out at this boundary. The mapping lives in
//   `v3CategoryToFeatureKind` below.
//
//   Search is case-insensitive substring match across brand, model,
//   display_name, and id. Results are loaded once at module scope and
//   cached as a singleton (`loadCatalogue()`).

import type { Feature } from "@stonehenge-proto/geometry";

import fixturesData from "../data/fixtures.json";

// ─────────────────────────────────────────────────────────────────────────
// V3 catalogue schema — typed to match
// `_research/2026-05-07-appliance-catalogue/types.ts`. Snake_case is the V3
// convention; we preserve it so the JSON round-trips into Postgres at
// fold-back without transformation.
// ─────────────────────────────────────────────────────────────────────────

export type V3Category =
  | "sink"
  | "laundry_tub"
  | "bathroom_basin_undermount"
  | "bathroom_basin_semi_recessed"
  | "bathroom_basin_inset"
  | "bathroom_basin_above_counter"
  | "bath_spout_deck_mount"
  | "cooktop"
  | "rangehood_downdraft"
  | "tap_mixer"
  | "boiling_water_tap"
  | "filter_water_tap"
  | "soap_dispenser"
  | "waste_disposer"
  | "pop_up_power"
  | "pop_up_exhaust"
  | "wireless_charger_integrated"
  | "microwave_drawer"
  | "warming_drawer"
  | "fridge_drawer"
  | "integrated_bin"
  | "bbq_built_in"
  | "outdoor_sink"
  | "side_burner"
  | "teppanyaki_plate"
  | "wok_burner";

export type V3MountType =
  | "undermount"
  | "overmount"
  | "flush"
  | "freestanding"
  | "wall_mount"
  | "n/a";

export interface V3RectangularCutout {
  readonly shape: "rectangle";
  readonly length_mm: number;
  readonly width_mm: number;
  readonly corner_radius_mm: number | null;
  readonly tolerance_mm?: number;
}

export interface V3CircularCutout {
  readonly shape: "circle";
  readonly diameter_mm: number;
  readonly tolerance_mm?: number;
}

export interface V3CustomCutout {
  readonly shape: "custom";
  readonly description: string;
  readonly bounding_box_mm: {
    readonly length: number;
    readonly width: number;
  };
}

export type V3CutoutGeometry =
  | V3RectangularCutout
  | V3CircularCutout
  | V3CustomCutout;

export interface V3BenchHole {
  readonly diameter_mm: number;
  readonly purpose: string;
  readonly offset_mm?: number;
  readonly min_diameter_mm?: number;
  readonly max_diameter_mm?: number;
}

export type V3VerificationStatus =
  | "VERIFIED"
  | "PARTIALLY_VERIFIED"
  | "MISMATCH"
  | "UNVERIFIABLE";

export interface V3Verification {
  readonly status: V3VerificationStatus;
  readonly checked_at: string;
  readonly issue?: string;
  readonly action?: string;
}

/**
 * V3 catalogue entry. Permissive on the per-category `spec` field — the
 * prototype only reads load-bearing fields (cutout, mount_type, brand,
 * model, display_name, bench_holes, verification). Full per-category
 * specs land in V3 fold-back.
 */
export interface V3CatalogueEntry {
  readonly id: string;
  readonly brand: string;
  readonly model: string;
  readonly display_name: string;
  readonly category: V3Category;
  readonly spec: Readonly<Record<string, unknown>>;
  readonly mount_type: V3MountType;
  readonly cutout?: V3CutoutGeometry;
  readonly bench_holes?: readonly V3BenchHole[];
  readonly clearances?: Readonly<Record<string, unknown>>;
  readonly bench_thickness?: Readonly<Record<string, unknown>>;
  readonly overall_dimensions_mm?: {
    readonly length: number;
    readonly width: number;
    readonly height: number;
  };
  readonly weight_kg?: number;
  readonly rrp_aud?: number;
  readonly australian_market: true;
  readonly source_url: string;
  readonly cross_reference_urls?: readonly string[];
  readonly last_verified: string;
  readonly notes?: string;
  readonly cutout_template_supplied?: boolean;
  readonly cutout_dims_verified_from_manufacturer?: boolean;
  readonly verification?: V3Verification;
}

interface V3CatalogueFile {
  readonly schema_version: string;
  readonly generated_at: string;
  readonly entries: readonly V3CatalogueEntry[];
}

// ─────────────────────────────────────────────────────────────────────────
// V3 → prototype Feature kind mapping
//
// The prototype renders 6 feature kinds. V3's 22 categories collapse into
// these via `category × mount_type`. Categories without a prototype kind
// (downdraft, pop-up power, basins, etc.) return null and are filtered out
// of the prototype catalogue.
// ─────────────────────────────────────────────────────────────────────────

export type PrototypeFeatureKind = Exclude<Feature["kind"], "custom-cutout">;

export function v3CategoryToFeatureKind(
  category: V3Category,
  mountType: V3MountType,
): PrototypeFeatureKind | null {
  if (category === "sink" || category === "outdoor_sink") {
    if (mountType === "undermount") return "undermount-sink";
    if (mountType === "overmount" || mountType === "flush") {
      return "overmount-sink";
    }
    // freestanding / wall_mount / n/a sinks aren't bench cutouts.
    return null;
  }

  if (
    category === "cooktop" ||
    category === "teppanyaki_plate" ||
    category === "wok_burner"
  ) {
    return "cooktop-cutout";
  }

  if (
    category === "tap_mixer" ||
    category === "boiling_water_tap" ||
    category === "filter_water_tap" ||
    category === "soap_dispenser"
  ) {
    return "tap-hole";
  }

  // Categories that produce bench cutouts but have no prototype kind:
  //   bbq_built_in, side_burner, rangehood_downdraft, pop_up_power,
  //   pop_up_exhaust, wireless_charger_integrated, microwave_drawer,
  //   warming_drawer, fridge_drawer, integrated_bin, waste_disposer,
  //   laundry_tub, bath_spout_deck_mount, bathroom_basin_*
  // These light up when V3 grows the kind taxonomy. For now they're
  // filtered out — operators see only kitchen-relevant items.
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Catalogue API
// ─────────────────────────────────────────────────────────────────────────

export interface FixtureCatalogue {
  /**
   * All entries that map to a prototype Feature kind. Entries without a
   * mappable kind, or without a `cutout` (and not template-supplied), are
   * filtered out at load time.
   */
  readonly entries: readonly V3CatalogueEntry[];

  /**
   * Resolve the prototype Feature kind for an entry. Stable across calls;
   * memoised at load time so the picker can colour-code by kind without
   * recomputing.
   */
  kindOf(entry: V3CatalogueEntry): PrototypeFeatureKind | null;

  /**
   * Case-insensitive substring search across brand, model, display_name, id.
   * If `kind` is provided, restricts results to entries that map to that
   * prototype kind. Empty/whitespace query returns all matching entries
   * for the kind filter. Results are sorted by brand alphabetically, then
   * by model.
   */
  search(
    query: string,
    kind?: PrototypeFeatureKind,
  ): readonly V3CatalogueEntry[];

  getById(id: string): V3CatalogueEntry | undefined;

  /**
   * V3 entries don't have a separate `sku` field — `id` is the SKU-like
   * slug. This is provided as a convenience alias for symmetry with the
   * V3 fold-back where `id` becomes the primary key column.
   */
  getBySku(sku: string): V3CatalogueEntry | undefined;

  /** Number of entries that map to the given prototype kind. */
  countByKind(kind: PrototypeFeatureKind): number;
}

let cachedCatalogue: FixtureCatalogue | null = null;

/**
 * Load the catalogue. Cached at module scope — the JSON is parsed and
 * indexed once. In V3 this becomes a Prisma query against
 * `fixture_catalogue` with tenant scoping.
 */
export function loadCatalogue(): FixtureCatalogue {
  if (cachedCatalogue) return cachedCatalogue;

  const file = fixturesData as unknown as V3CatalogueFile;

  // Index 1 — only entries that map to a prototype kind. An entry must
  // either have a cutout, or carry `cutout_template_supplied: true` (which
  // means manufacturer ships a paper/MDF template and the cutout numbers
  // are advisory). Entries with neither aren't placeable.
  const kindByEntryId = new Map<string, PrototypeFeatureKind>();
  const filtered: V3CatalogueEntry[] = [];
  for (const entry of file.entries) {
    const kind = v3CategoryToFeatureKind(entry.category, entry.mount_type);
    if (!kind) continue;
    const hasCutout = entry.cutout !== undefined;
    const templated = entry.cutout_template_supplied === true;
    if (!hasCutout && !templated) continue;
    kindByEntryId.set(entry.id, kind);
    filtered.push(entry);
  }

  // Sort: brand asc, then display_name asc.
  const sorted = filtered.slice().sort((a, b) => {
    const byBrand = a.brand.localeCompare(b.brand);
    if (byBrand !== 0) return byBrand;
    return a.display_name.localeCompare(b.display_name);
  });

  // Index 2 — by id (and by sku alias).
  const byId = new Map<string, V3CatalogueEntry>();
  for (const entry of sorted) byId.set(entry.id, entry);

  // Index 3 — counts by kind.
  const countsByKind = new Map<PrototypeFeatureKind, number>();
  for (const kind of kindByEntryId.values()) {
    countsByKind.set(kind, (countsByKind.get(kind) ?? 0) + 1);
  }

  const catalogue: FixtureCatalogue = {
    entries: sorted,

    kindOf(entry) {
      return kindByEntryId.get(entry.id) ?? null;
    },

    search(query, kind) {
      const q = query.trim().toLowerCase();
      const filteredByKind =
        kind === undefined
          ? sorted
          : sorted.filter((e) => kindByEntryId.get(e.id) === kind);
      if (q.length === 0) return filteredByKind;
      return filteredByKind.filter((entry) => matchesQuery(entry, q));
    },

    getById(id) {
      return byId.get(id);
    },

    getBySku(sku) {
      return byId.get(sku);
    },

    countByKind(kind) {
      return countsByKind.get(kind) ?? 0;
    },
  };

  cachedCatalogue = catalogue;
  return catalogue;
}

function matchesQuery(entry: V3CatalogueEntry, q: string): boolean {
  return (
    entry.brand.toLowerCase().includes(q) ||
    entry.model.toLowerCase().includes(q) ||
    entry.display_name.toLowerCase().includes(q) ||
    entry.id.toLowerCase().includes(q)
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Resetting cache — for tests only. The exported singleton is what the
// runtime uses; tests that reload need to bypass the cache.
// ─────────────────────────────────────────────────────────────────────────

export function __resetCatalogueCacheForTesting(): void {
  cachedCatalogue = null;
}
