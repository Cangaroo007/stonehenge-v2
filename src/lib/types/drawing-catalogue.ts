/**
 * Catalogue data loaded from DB for use in drawing analysis.
 * Passed into prompts so AI questions reference real tenant options.
 */
export interface DrawingCatalogue {
  materials: CatalogueMaterial[];
  edgeTypes: CatalogueEdgeType[];
  cutoutTypes: CatalogueCutoutType[];
}

export interface CatalogueMaterial {
  id: number;
  name: string;
  collection: string | null;
}

export interface CatalogueEdgeType {
  id: string;
  name: string;
  code: string | null;
}

export interface CatalogueCutoutType {
  id: string;
  name: string;
}
