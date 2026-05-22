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
});
