import type { NextRequest } from 'next/server';
import { protoPieceToV2Patch, v2PieceToProtoPiece } from '@/lib/services/proto-geometry-adapter';

let POST: typeof import('./route').POST;
let PATCH: typeof import('./[pieceId]/route').PATCH;
let IMPORT_POST: typeof import('../import-pieces/route').POST;

const mockPrisma = {
  pricing_settings: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  materials: {
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  material_edge_compatibility: {
    findMany: jest.fn(),
  },
  quote_rooms: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  quote_pieces: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  piece_relationships: {
    findMany: jest.fn(),
  },
  edge_types: {
    findMany: jest.fn(),
  },
  slab_optimizations: {
    deleteMany: jest.fn(),
  },
  quotes: {
    update: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: mockPrisma,
}));

jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn().mockResolvedValue({ user: { id: 9, companyId: 3 } }),
  verifyQuoteOwnership: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/lib/services/pricing-calculator-v2', () => ({
  calculateQuotePrice: jest.fn().mockResolvedValue({ total: 0, breakdown: { pieces: [] } }),
}));

jest.mock('@/lib/services/quote-pricing-persistence', () => ({
  buildQuotePricingUpdate: jest.fn().mockReturnValue({ total_cost: 0 }),
}));

jest.mock('@/lib/services/quote-version-service', () => ({
  createQuoteSnapshot: jest.fn().mockResolvedValue({ rooms: [] }),
  createQuoteVersion: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/services/piece-relationship-service', () => ({
  deleteRelationshipsForPiece: jest.fn().mockResolvedValue(undefined),
  syncEdgeSemanticsForRelationship: jest.fn().mockResolvedValue(undefined),
}));

describe('piece polygon route validation', () => {
  beforeAll(() => {
    ({ POST } = require('./route'));
    ({ PATCH } = require('./[pieceId]/route'));
    ({ POST: IMPORT_POST } = require('../import-pieces/route'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.pricing_settings.findFirst.mockResolvedValue({ default_edge_type_id: null });
    mockPrisma.pricing_settings.findUnique.mockResolvedValue(null);
    mockPrisma.materials.findFirst.mockResolvedValue(null);
    mockPrisma.materials.count.mockResolvedValue(0);
    mockPrisma.material_edge_compatibility.findMany.mockResolvedValue([]);
    mockPrisma.quote_rooms.findFirst.mockResolvedValue({ id: 5, name: 'Kitchen', quote_id: 42, sort_order: 0 });
    mockPrisma.quote_rooms.create.mockResolvedValue({ id: 5, name: 'Kitchen', quote_id: 42, sort_order: 0 });
    mockPrisma.quote_pieces.findFirst.mockResolvedValue(null);
    mockPrisma.quote_pieces.count.mockResolvedValue(1);
    mockPrisma.piece_relationships.findMany.mockResolvedValue([]);
    mockPrisma.edge_types.findMany.mockResolvedValue([]);
    mockPrisma.slab_optimizations.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.quotes.update.mockResolvedValue({});
  });

  it('rejects invalid canonical polygons before creating a piece', async () => {
    const invalidShapeConfig = {
      ...validPolygonPatch().shape_config,
      outerRing: { edges: ['v2-piece-12-edge-top', 'v2-piece-12-edge-right'], orientation: 'ccw' as const },
    };

    const response = await POST(jsonRequest({
      name: 'Broken polygon',
      lengthMm: 1200,
      widthMm: 500,
      roomName: 'Kitchen',
      shapeType: 'POLYGON',
      shapeConfig: invalidShapeConfig,
    }), { params: Promise.resolve({ id: '42' }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/at least three edges|Invalid polygon/),
    });
    expect(mockPrisma.quote_pieces.create).not.toHaveBeenCalled();
  });

  it('normalizes valid canonical polygons on create before persistence', async () => {
    const patch = validPolygonPatch();
    mockPrisma.quote_pieces.create.mockImplementation(async ({ data, include }) => ({
      id: 88,
      ...data,
      materials: include?.materials ? null : undefined,
      quote_rooms: { id: 5, name: 'Kitchen' },
    }));

    const response = await POST(jsonRequest({
      name: 'Canonical vanity',
      lengthMm: 9999,
      widthMm: 8888,
      roomName: 'Kitchen',
      shapeType: 'POLYGON',
      shapeConfig: patch.shape_config,
    }), { params: Promise.resolve({ id: '42' }) });

    expect(response.status).toBe(200);
    expect(mockPrisma.quote_pieces.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        length_mm: 1200,
        width_mm: 500,
        area_sqm: 0.6,
        shape_type: 'POLYGON',
        edge_top: 'arris-edge',
        edge_right: 'arris-edge',
        edge_bottom: 'pencil-round-edge',
        edge_left: null,
        no_strip_edges: ['left'],
        shape_config: expect.objectContaining({
          type: 'canonical-polygon',
          edgeLengths: patch.shape_config.edgeLengths,
        }),
      }),
    }));
  });

  it('keeps canonical edge ids and metadata stable through PATCH normalization', async () => {
    const patch = validPolygonPatch();
    const currentPiece = {
      id: 88,
      room_id: 5,
      quote_rooms: { id: 5, name: 'Kitchen', quote_id: 42 },
      name: 'Canonical vanity',
      description: null,
      length_mm: 9999,
      width_mm: 8888,
      thickness_mm: 20,
      material_id: null,
      material_name: null,
      edge_top: 'stale-top',
      edge_right: 'stale-right',
      edge_bottom: 'stale-bottom',
      edge_left: 'stale-left',
      cutouts: [],
      lamination_method: 'NONE',
      shape_type: 'POLYGON',
      shape_config: patch.shape_config,
      no_strip_edges: [],
      edge_buildups: null,
      strip_width_overrides: null,
      piece_type: 'BENCHTOP',
      features_cost: { toNumber: () => 0 },
      requiresGrainMatch: false,
      override_material_cost: null,
      override_slab_price: null,
      override_fabrication_cost: null,
      material_collection_only: false,
      material_collection_name: null,
      sort_order: 0,
      edge_arc_config: null,
      mitred_corner_treatment: 'RAW',
    };
    mockPrisma.quote_pieces.findUnique.mockResolvedValue(currentPiece);
    mockPrisma.quote_pieces.update.mockImplementation(async ({ data, include }) => ({
      ...currentPiece,
      ...data,
      materials: include?.materials ? null : undefined,
      quote_rooms: currentPiece.quote_rooms,
    }));

    const response = await PATCH(jsonRequest({ name: 'Canonical vanity v2' }), {
      params: Promise.resolve({ id: '42', pieceId: '88' }),
    });

    expect(response.status).toBe(200);
    const updateData = mockPrisma.quote_pieces.update.mock.calls[0][0].data;
    expect(updateData).toEqual(expect.objectContaining({
      length_mm: 1200,
      width_mm: 500,
      area_sqm: 0.6,
      edge_top: 'arris-edge',
      edge_right: 'arris-edge',
      edge_bottom: 'pencil-round-edge',
      edge_left: null,
      no_strip_edges: ['left'],
    }));
    expect(updateData.shape_config.edges['v2-piece-12-edge-top']).toMatchObject({
      id: 'v2-piece-12-edge-top',
      profile: 'pencil-round',
      finish: 'polished',
      exposure: 'exposed',
      v2EdgeSide: 'top',
      v2EdgeTypeId: 'arris-edge',
    });
    expect(updateData.shape_config.outerRing.edges).toEqual(patch.shape_config.outerRing.edges);
  });

  it('rejects invalid canonical polygons during drawing import before creating pieces', async () => {
    const invalidShapeConfig = {
      ...validPolygonPatch().shape_config,
      outerRing: { edges: ['v2-piece-12-edge-top', 'v2-piece-12-edge-right'], orientation: 'ccw' as const },
    };

    const response = await IMPORT_POST(jsonRequest({
      pieces: [{
        name: 'Imported broken polygon',
        length: 1200,
        width: 500,
        room: 'Kitchen',
        shapeType: 'POLYGON',
        shapeConfig: invalidShapeConfig,
      }],
    }), { params: Promise.resolve({ id: '42' }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/Piece 1 has invalid polygon geometry/),
    });
    expect(mockPrisma.quote_pieces.create).not.toHaveBeenCalled();
  });
});

function jsonRequest(body: unknown): NextRequest {
  return {
    json: jest.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

function validPolygonPatch() {
  return protoPieceToV2Patch(v2PieceToProtoPiece({
    id: 12,
    name: 'Vanity',
    length_mm: 1200,
    width_mm: 500,
    thickness_mm: 20,
    material_id: null,
    piece_type: 'BENCHTOP',
    edge_top: 'arris-edge',
    edge_right: 'arris-edge',
    edge_bottom: 'pencil-round-edge',
    edge_left: null,
    no_strip_edges: ['left'],
    edge_buildups: {},
    cutouts: [],
  }));
}
