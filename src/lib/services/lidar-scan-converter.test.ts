import { MOCK_LIDAR_SCANS } from '@/lib/lidar/mock-scans';
import { convertLidarScanToQuotePieces } from './lidar-scan-converter';

describe('convertLidarScanToQuotePieces', () => {
  it('converts the vanity scan to a rectangular piece with wall and cutout hints', () => {
    const scan = MOCK_LIDAR_SCANS.find(item => item.scanId === 'mock-vanity-001');
    expect(scan).toBeDefined();

    const result = convertLidarScanToQuotePieces(scan!);

    expect(result.warnings).toEqual([]);
    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0]).toMatchObject({
      roomName: 'Bathroom',
      lengthMm: 1200,
      widthMm: 500,
      shapeType: 'RECTANGLE',
      noStripEdges: ['top'],
    });
    expect(result.pieces[0].cutouts.map(c => c.type)).toEqual(['Undermount Sink', 'Tap Hole']);
  });

  it('keeps L-shape geometry as a shaped v2 piece', () => {
    const scan = MOCK_LIDAR_SCANS.find(item => item.scanId === 'mock-lshape-001');
    expect(scan).toBeDefined();

    const result = convertLidarScanToQuotePieces(scan!);

    expect(result.warnings).toEqual([]);
    expect(result.pieces[0].shapeType).toBe('L_SHAPE');
    expect(result.pieces[0].shapeConfig).toMatchObject({
      shape: 'L_SHAPE',
      leg1: { length_mm: 3200, width_mm: 600 },
      leg2: { length_mm: 2400, width_mm: 600 },
    });
    expect(result.pieces[0].areaSqm).toBeCloseTo(3);
  });

  it('keeps U-shape geometry as a shaped v2 piece', () => {
    const scan = MOCK_LIDAR_SCANS.find(item => item.scanId === 'mock-ushape-001');
    expect(scan).toBeDefined();

    const result = convertLidarScanToQuotePieces(scan!);

    expect(result.warnings).toEqual([]);
    expect(result.pieces[0].shapeType).toBe('U_SHAPE');
    expect(result.pieces[0].shapeConfig).toMatchObject({
      shape: 'U_SHAPE',
      leftLeg: { length_mm: 3000, width_mm: 600 },
      back: { length_mm: 3600, width_mm: 600 },
      rightLeg: { length_mm: 3000, width_mm: 600 },
    });
    expect(result.pieces[0].areaSqm).toBeCloseTo(5.04);
  });
});
