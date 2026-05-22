import { MOCK_LIDAR_SCANS } from '@/lib/lidar/mock-scans';
import { convertLidarScanToQuotePieces } from './lidar-scan-converter';

describe('convertLidarScanToQuotePieces', () => {
  it('converts the vanity scan to a rectangular piece with wall and cutout hints', () => {
    const scan = MOCK_LIDAR_SCANS.find(item => item.scanId === 'mock-vanity-001');
    expect(scan).toBeDefined();

    const result = convertLidarScanToQuotePieces(scan!, {
      edgeTypeIdForExposedEdges: 'edge-pencil-round',
    });

    expect(result.warnings).toEqual([]);
    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0]).toMatchObject({
      roomName: 'Bathroom',
      lengthMm: 1200,
      widthMm: 500,
      shapeType: 'POLYGON',
      noStripEdges: ['top'],
    });
    expect(result.pieces[0].shapeConfig).toMatchObject({
      type: 'canonical-polygon',
      areaSqm: 0.6,
    });
    expect(result.pieces[0].cutouts.map(c => c.type)).toEqual(['Undermount Sink', 'Tap Hole']);
    expect((result.pieces[0].shapeConfig as any).edgeLengths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ v2EdgeSide: 'bottom', v2EdgeTypeId: 'edge-pencil-round' }),
        expect.objectContaining({ v2EdgeSide: 'left', v2EdgeTypeId: 'edge-pencil-round' }),
        expect.objectContaining({ v2EdgeSide: 'right', v2EdgeTypeId: 'edge-pencil-round' }),
        expect.objectContaining({ v2EdgeSide: 'top', v2EdgeTypeId: null }),
      ]),
    );
  });

  it('keeps L-shape geometry as a canonical polygon', () => {
    const scan = MOCK_LIDAR_SCANS.find(item => item.scanId === 'mock-lshape-001');
    expect(scan).toBeDefined();

    const result = convertLidarScanToQuotePieces(scan!);

    expect(result.warnings).toEqual([]);
    expect(result.pieces[0].shapeType).toBe('POLYGON');
    expect(result.pieces[0].shapeConfig).toMatchObject({
      type: 'canonical-polygon',
    });
    expect((result.pieces[0].shapeConfig as any).outerRing.edges).toHaveLength(6);
    expect(result.pieces[0].areaSqm).toBeCloseTo(3);
  });

  it('keeps U-shape geometry as a canonical polygon', () => {
    const scan = MOCK_LIDAR_SCANS.find(item => item.scanId === 'mock-ushape-001');
    expect(scan).toBeDefined();

    const result = convertLidarScanToQuotePieces(scan!);

    expect(result.warnings).toEqual([]);
    expect(result.pieces[0].shapeType).toBe('POLYGON');
    expect(result.pieces[0].shapeConfig).toMatchObject({
      type: 'canonical-polygon',
    });
    expect((result.pieces[0].shapeConfig as any).outerRing.edges).toHaveLength(8);
    expect(result.pieces[0].areaSqm).toBeCloseTo(5.04);
  });

  it('assigns appliances only to the countertop polygon that contains them', () => {
    const scan = {
      scanId: 'multi-top-kitchen',
      capturedAt: '2026-05-22T09:00:00+10:00',
      roomType: 'kitchen',
      dimensions: { widthMm: 5000, depthMm: 3600, ceilingHeightMm: 2700 },
      walls: [],
      countertops: [
        {
          name: 'Rear run',
          heightFromFloorMm: 900,
          vertices: [
            { x: 0, y: 0 },
            { x: 3000, y: 0 },
            { x: 3000, y: 600 },
            { x: 0, y: 600 },
          ],
        },
        {
          name: 'Island',
          heightFromFloorMm: 900,
          vertices: [
            { x: 900, y: 1700 },
            { x: 3100, y: 1700 },
            { x: 3100, y: 2600 },
            { x: 900, y: 2600 },
          ],
        },
      ],
      appliances: [
        { kind: 'cooktop' as const, boundingBox: { x: 900, y: 80, widthMm: 600, depthMm: 500 }, confidence: 0.9 },
        { kind: 'sink' as const, boundingBox: { x: 1700, y: 1900, widthMm: 760, depthMm: 450 }, confidence: 0.9 },
      ],
    };

    const result = convertLidarScanToQuotePieces(scan);

    expect(result.pieces).toHaveLength(2);
    expect(result.pieces[0].name).toBe('Rear run');
    expect(result.pieces[0].cutouts.map(c => c.type)).toEqual(['Cooktop Cutout']);
    expect(result.pieces[0].source.applianceCount).toBe(1);
    expect(result.pieces[1].name).toBe('Island');
    expect(result.pieces[1].cutouts.map(c => c.type)).toEqual(['Undermount Sink']);
    expect(result.pieces[1].source.applianceCount).toBe(1);
  });
});
