import {
  moveVertex,
  splitEdge,
  validateEdgeIdStability,
} from '@stonehenge-proto/geometry';
import type { Vertex } from '@stonehenge-proto/geometry';
import { getCuttingPerimeterLm, getShapeGeometry } from '@/lib/types/shapes';
import {
  protoPieceToV2Patch,
  v2PieceToProtoPiece,
} from './proto-geometry-adapter';

describe('proto geometry adapter', () => {
  it('moves a vertex without losing edge metadata', () => {
    const piece = v2PieceToProtoPiece(rectPiece());
    const moved = moveVertex(piece, piece.vertices[1].id, 1300, 0);

    expect(validateEdgeIdStability(piece, moved, piece.outerRing.edges)).toBe(true);
    expect(moved.edges.find(edge => edge.id === piece.edges[0].id)).toMatchObject({
      profile: piece.edges[0].profile,
      finish: piece.edges[0].finish,
      exposure: piece.edges[0].exposure,
    });
  });

  it('splits an edge and copies profile, finish, exposure, and build-up to both new edges', () => {
    const piece = v2PieceToProtoPiece(rectPiece({
      edge_buildups: {
        top: { depth: 40, exposed: true, chargeCut: true, chargePolish: true },
      },
    }));
    const target = piece.edges[0];
    const splitPoint: Vertex = {
      id: 'split-top-midpoint' as Vertex['id'],
      x: 600,
      y: 0,
    };

    const split = splitEdge(piece, target.id, splitPoint);
    const halves = split.edges.filter(edge => edge.generatedBy === 'split');

    expect(halves).toHaveLength(2);
    expect(halves[0]).toMatchObject({
      profile: target.profile,
      finish: target.finish,
      exposure: target.exposure,
      buildUp: target.buildUp,
    });
    expect(halves[1]).toMatchObject({
      profile: target.profile,
      finish: target.finish,
      exposure: target.exposure,
      buildUp: target.buildUp,
    });
  });

  it('saves and reloads an L-shaped piece as a canonical polygon instead of a rectangle', () => {
    const piece = v2PieceToProtoPiece({
      ...rectPiece(),
      id: 77,
      length_mm: 3200,
      width_mm: 2400,
    });
    const polygonPiece = {
      ...piece,
      vertices: [
        { id: 'l-v0' as Vertex['id'], x: 0, y: 0 },
        { id: 'l-v1' as Vertex['id'], x: 3200, y: 0 },
        { id: 'l-v2' as Vertex['id'], x: 3200, y: 600 },
        { id: 'l-v3' as Vertex['id'], x: 600, y: 600 },
        { id: 'l-v4' as Vertex['id'], x: 600, y: 2400 },
        { id: 'l-v5' as Vertex['id'], x: 0, y: 2400 },
      ],
      edges: [
        edge('l-e0', 'l-v0', 'l-v1', 'top'),
        edge('l-e1', 'l-v1', 'l-v2', 'right'),
        edge('l-e2', 'l-v2', 'l-v3', 'inner'),
        edge('l-e3', 'l-v3', 'l-v4', 'inner'),
        edge('l-e4', 'l-v4', 'l-v5', 'bottom'),
        edge('l-e5', 'l-v5', 'l-v0', 'left'),
      ],
      outerRing: {
        edges: ['l-e0', 'l-e1', 'l-e2', 'l-e3', 'l-e4', 'l-e5'] as typeof piece.outerRing.edges,
        orientation: 'ccw' as const,
      },
    };

    const patch = protoPieceToV2Patch(polygonPiece);
    const reloaded = v2PieceToProtoPiece({
      ...rectPiece(),
      id: 77,
      shape_config: patch.shape_config,
    });

    expect(patch.shape_type).toBe('POLYGON');
    expect(patch.shape_config.type).toBe('canonical-polygon');
    expect(reloaded.vertices).toHaveLength(6);
    expect(reloaded.outerRing.edges).toEqual(polygonPiece.outerRing.edges);
  });

  it('area and perimeter pricing read from the persisted polygon snapshot', () => {
    const piece = v2PieceToProtoPiece(rectPiece());
    const patch = protoPieceToV2Patch(piece);

    expect(getShapeGeometry('POLYGON', patch.shape_config, 9999, 9999).totalAreaSqm).toBe(0.6);
    expect(getCuttingPerimeterLm('POLYGON', patch.shape_config, 9999, 9999)).toBe(3.4);
  });
});

function rectPiece(overrides = {}) {
  return {
    id: 12,
    name: 'Vanity',
    length_mm: 1200,
    width_mm: 500,
    thickness_mm: 20,
    material_id: 1,
    piece_type: 'BENCHTOP',
    edge_top: 'arris-edge',
    edge_right: 'arris-edge',
    edge_bottom: 'pencil-round-edge',
    edge_left: null,
    no_strip_edges: ['left'],
    edge_buildups: {},
    cutouts: [{ name: 'Tap Hole', quantity: 1 }],
    ...overrides,
  };
}

function edge(id: string, start: string, end: string, side: string) {
  return {
    id: id as any,
    start: start as any,
    end: end as any,
    profile: 'pencil-round' as const,
    finish: 'polished' as const,
    exposure: 'exposed' as const,
    v2EdgeSide: side,
    v2EdgeTypeId: 'pencil-round-edge',
  };
}
