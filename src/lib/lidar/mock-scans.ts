export interface LidarPoint {
  x: number;
  y: number;
}

export interface LidarWall {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  hasWindow: boolean;
  windowRecess?: {
    widthMm: number;
    depthMm: number;
    offsetMm: number;
  };
}

export interface LidarCountertop {
  name?: string;
  vertices: LidarPoint[];
  heightFromFloorMm: number;
  estimatedMaterial?: string;
}

export interface LidarAppliance {
  kind: 'sink' | 'cooktop' | 'tap';
  boundingBox: {
    x: number;
    y: number;
    widthMm: number;
    depthMm: number;
  };
  confidence: number;
}

export interface LidarScan {
  scanId: string;
  capturedAt: string;
  roomType: string;
  dimensions: {
    widthMm: number;
    depthMm: number;
    ceilingHeightMm: number;
  };
  walls: LidarWall[];
  countertops: LidarCountertop[];
  appliances: LidarAppliance[];
  exposureHints?: {
    edgesAgainstWall?: string[];
    edgesExposed?: string[];
  };
  edgeFinishHints?: Record<string, { profile?: string; kind?: string }>;
}

export const MOCK_LIDAR_SCANS: LidarScan[] = [
  {
    scanId: 'mock-vanity-001',
    capturedAt: '2026-05-05T11:00:00+10:00',
    roomType: 'bathroom',
    dimensions: { widthMm: 2400, depthMm: 1800, ceilingHeightMm: 2400 },
    walls: [
      { startX: 0, startY: 0, endX: 2400, endY: 0, hasWindow: false },
      { startX: 2400, startY: 0, endX: 2400, endY: 1800, hasWindow: false },
      { startX: 2400, startY: 1800, endX: 0, endY: 1800, hasWindow: false },
      { startX: 0, startY: 1800, endX: 0, endY: 0, hasWindow: false },
    ],
    countertops: [
      {
        name: 'Vanity top',
        vertices: [
          { x: 600, y: 0 }, { x: 1800, y: 0 },
          { x: 1800, y: 500 }, { x: 600, y: 500 },
        ],
        heightFromFloorMm: 900,
        estimatedMaterial: 'engineered-stone',
      },
    ],
    appliances: [
      { kind: 'sink', boundingBox: { x: 1050, y: 100, widthMm: 380, depthMm: 300 }, confidence: 0.94 },
      { kind: 'tap', boundingBox: { x: 1200, y: 30, widthMm: 50, depthMm: 50 }, confidence: 0.85 },
    ],
    exposureHints: {
      edgesAgainstWall: ['north'],
      edgesExposed: ['south', 'east', 'west'],
    },
  },
  {
    scanId: 'mock-lshape-001',
    capturedAt: '2026-05-05T10:00:00+10:00',
    roomType: 'kitchen',
    dimensions: { widthMm: 4200, depthMm: 3600, ceilingHeightMm: 2700 },
    walls: [
      { startX: 0, startY: 0, endX: 4200, endY: 0, hasWindow: true, windowRecess: { widthMm: 1200, depthMm: 100, offsetMm: 1500 } },
      { startX: 4200, startY: 0, endX: 4200, endY: 3600, hasWindow: false },
      { startX: 4200, startY: 3600, endX: 0, endY: 3600, hasWindow: false },
      { startX: 0, startY: 3600, endX: 0, endY: 0, hasWindow: false },
    ],
    countertops: [
      {
        name: 'L-shape benchtop',
        vertices: [
          { x: 0, y: 0 }, { x: 3200, y: 0 },
          { x: 3200, y: 600 }, { x: 600, y: 600 },
          { x: 600, y: 2400 }, { x: 0, y: 2400 },
        ],
        heightFromFloorMm: 900,
        estimatedMaterial: 'engineered-stone',
      },
    ],
    appliances: [
      { kind: 'sink', boundingBox: { x: 1200, y: 50, widthMm: 760, depthMm: 450 }, confidence: 0.92 },
      { kind: 'cooktop', boundingBox: { x: 100, y: 1000, widthMm: 600, depthMm: 520 }, confidence: 0.87 },
      { kind: 'tap', boundingBox: { x: 2000, y: 50, widthMm: 50, depthMm: 50 }, confidence: 0.78 },
    ],
  },
  {
    scanId: 'mock-ushape-001',
    capturedAt: '2026-05-05T10:30:00+10:00',
    roomType: 'kitchen',
    dimensions: { widthMm: 3600, depthMm: 3600, ceilingHeightMm: 2700 },
    walls: [
      { startX: 0, startY: 0, endX: 3600, endY: 0, hasWindow: false },
      { startX: 3600, startY: 0, endX: 3600, endY: 3600, hasWindow: false },
      { startX: 3600, startY: 3600, endX: 0, endY: 3600, hasWindow: true, windowRecess: { widthMm: 900, depthMm: 100, offsetMm: 1350 } },
      { startX: 0, startY: 3600, endX: 0, endY: 0, hasWindow: false },
    ],
    countertops: [
      {
        name: 'U-shape benchtop',
        vertices: [
          { x: 0, y: 0 },
          { x: 600, y: 0 },
          { x: 600, y: 2400 },
          { x: 3000, y: 2400 },
          { x: 3000, y: 0 },
          { x: 3600, y: 0 },
          { x: 3600, y: 3000 },
          { x: 0, y: 3000 },
        ],
        heightFromFloorMm: 900,
        estimatedMaterial: 'engineered-stone',
      },
    ],
    appliances: [
      { kind: 'sink', boundingBox: { x: 1700, y: 2450, widthMm: 760, depthMm: 450 }, confidence: 0.91 },
      { kind: 'cooktop', boundingBox: { x: 100, y: 1300, widthMm: 600, depthMm: 520 }, confidence: 0.88 },
      { kind: 'tap', boundingBox: { x: 1900, y: 2440, widthMm: 50, depthMm: 50 }, confidence: 0.76 },
      { kind: 'tap', boundingBox: { x: 2200, y: 2440, widthMm: 50, depthMm: 50 }, confidence: 0.74 },
    ],
  },
  {
    scanId: 'mock-island-001',
    capturedAt: '2026-05-05T11:30:00+10:00',
    roomType: 'kitchen',
    dimensions: { widthMm: 4800, depthMm: 4800, ceilingHeightMm: 2700 },
    walls: [
      { startX: 0, startY: 0, endX: 4800, endY: 0, hasWindow: false },
      { startX: 4800, startY: 0, endX: 4800, endY: 4800, hasWindow: false },
      { startX: 4800, startY: 4800, endX: 0, endY: 4800, hasWindow: false },
      { startX: 0, startY: 4800, endX: 0, endY: 0, hasWindow: false },
    ],
    countertops: [
      {
        name: 'Island',
        vertices: [
          { x: 1200, y: 1950 }, { x: 3600, y: 1950 },
          { x: 3600, y: 2850 }, { x: 1200, y: 2850 },
        ],
        heightFromFloorMm: 900,
        estimatedMaterial: 'natural-stone',
      },
    ],
    appliances: [
      { kind: 'cooktop', boundingBox: { x: 1600, y: 2200, widthMm: 800, depthMm: 520 }, confidence: 0.9 },
    ],
    exposureHints: {
      edgesAgainstWall: [],
      edgesExposed: ['south', 'east', 'north', 'west'],
    },
    edgeFinishHints: {
      south: { profile: 'full-bullnose' },
      north: { profile: 'full-bullnose' },
      east: { profile: 'mitre-45', kind: 'waterfall' },
      west: { profile: 'mitre-45', kind: 'waterfall' },
    },
  },
  {
    scanId: 'mock-open-plan-001',
    capturedAt: '2026-05-14T09:00:00+10:00',
    roomType: 'kitchen',
    dimensions: { widthMm: 5000, depthMm: 4000, ceilingHeightMm: 2700 },
    walls: [
      { startX: 0, startY: 0, endX: 5000, endY: 0, hasWindow: true, windowRecess: { widthMm: 400, depthMm: 60, offsetMm: 1620 } },
      { startX: 5000, startY: 0, endX: 5000, endY: 4000, hasWindow: false },
      { startX: 0, startY: 4000, endX: 0, endY: 0, hasWindow: false },
    ],
    countertops: [
      {
        name: 'Main benchtop',
        vertices: [
          { x: 0, y: 0 },
          { x: 3200, y: 0 },
          { x: 3200, y: 1800 },
          { x: 600, y: 1800 },
          { x: 600, y: 600 },
          { x: 0, y: 600 },
        ],
        heightFromFloorMm: 900,
        estimatedMaterial: 'engineered-stone',
      },
    ],
    appliances: [
      { kind: 'sink', boundingBox: { x: 800, y: 75, widthMm: 760, depthMm: 450 }, confidence: 0.93 },
      { kind: 'cooktop', boundingBox: { x: 2100, y: 75, widthMm: 600, depthMm: 520 }, confidence: 0.89 },
      { kind: 'tap', boundingBox: { x: 1810, y: 75, widthMm: 50, depthMm: 50 }, confidence: 0.81 },
    ],
  },
];

export function getMockLidarScan(scanId: string): LidarScan | undefined {
  return MOCK_LIDAR_SCANS.find(scan => scan.scanId === scanId);
}

export function listMockLidarScans() {
  return MOCK_LIDAR_SCANS.map(scan => ({
    scanId: scan.scanId,
    roomType: scan.roomType,
    capturedAt: scan.capturedAt,
    countertopCount: scan.countertops.length,
    applianceCount: scan.appliances.length,
    label: scan.countertops[0]?.name ?? scan.scanId,
  }));
}
