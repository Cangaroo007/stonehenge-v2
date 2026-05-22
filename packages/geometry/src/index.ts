// packages/geometry/src/index.ts
//
// Public API for @stonehenge-proto/geometry. Re-exports all stable surfaces;
// internal helpers stay in their modules.

export type {
  BoundingBoxMm,
  BuildUpDescriptor,
  CooktopCutout,
  CurveDescriptor,
  CustomCutout,
  Edge,
  EdgeExposure,
  EdgeFinish,
  EdgeId,
  EdgeProfile,
  Feature,
  FeatureId,
  FeatureKind,
  Job,
  Join,
  JoinId,
  JoinKind,
  JoinReason,
  MitreDescriptor,
  OvermountSink,
  Piece,
  PieceId,
  PieceRole,
  PieceTransform,
  Ring,
  TapHole,
  UndermountSink,
  Vertex,
  VertexId,
  WindowRecess,
} from "./types";

export {
  edgeId,
  featureId,
  joinId,
  pieceId,
  vertexId,
} from "./ids";

export {
  computeAreaM2,
  computeAreaMm2,
  computeBoundingBox,
  computeEdgeLengthMm,
  computeExposedPerimeterMm,
  computePerimeterMm,
} from "./kernel";

export {
  mergeEdges,
  moveVertex,
  setEdgeExposure,
  setEdgeProfile,
  splitEdge,
} from "./edge-ops";

// Round-3A — vertex topology operations and arc geometry
export {
  insertVertexOnEdge,
  insertVertexAtMidpoint,
  removeVertex,
  interiorAngleDeg,
  setVertexAngle,
  setVertexCornerRadius,
  setEdgeCurve,
} from "./vertex-ops";

export {
  computeCornerArc,
  computeRoundEndCurve,
  curvedEdgeArcLengthMm,
  curvedEdgeSegmentArea,
  cornerArcAreaCorrection,
  isValidCornerRadius,
  interiorAngleRad,
} from "./curve-ops";

export type { CornerArc, Pt2D } from "./curve-ops";

export {
  isSimplePolygon,
  validateEdgeIdStability,
  validatePiece,
} from "./validation";

export type { ValidationResult } from "./validation";

// Round-3B — multi-piece + build-ups
export { generateBuildUpPieces } from "./buildup-ops";
export type { GenerateBuildUpInput } from "./buildup-ops";

export {
  detectAllJoins,
  detectJoinsForPiece,
  makeJoin,
} from "./join-detection";
