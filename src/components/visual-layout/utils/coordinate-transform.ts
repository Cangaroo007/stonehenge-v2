/**
 * Coordinate Transformation Utilities
 * 
 * Convert between canvas coordinates (pixels) and world coordinates (mm)
 */

import { CanvasState } from '../types';

/**
 * Convert canvas pixel coordinates to world coordinates (mm)
 */
export function coordinateToWorld(
  canvasX: number,
  canvasY: number,
  canvasState: CanvasState
): { x: number; y: number } {
  return {
    x: (canvasX - canvasState.offsetX) / canvasState.scale,
    y: (canvasY - canvasState.offsetY) / canvasState.scale,
  };
}

/**
 * Convert world coordinates (mm) to canvas pixel coordinates
 */
export function worldToCoordinate(
  worldX: number,
  worldY: number,
  canvasState: CanvasState
): { x: number; y: number } {
  return {
    x: worldX * canvasState.scale + canvasState.offsetX,
    y: worldY * canvasState.scale + canvasState.offsetY,
  };
}

/**
 * Snap a value to the nearest grid increment
 */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Calculate the scale factor to fit the slab in the viewport
 */
export function calculateFitScale(
  slabWidth: number,
  slabHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding: number = 40
): number {
  const availableWidth = viewportWidth - padding * 2;
  const availableHeight = viewportHeight - padding * 2;

  const scaleX = availableWidth / slabWidth;
  const scaleY = availableHeight / slabHeight;

  return Math.min(scaleX, scaleY);
}

/**
 * Calculate offset to center the slab in the viewport
 */
export function calculateCenterOffset(
  slabWidth: number,
  slabHeight: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  const scaledWidth = slabWidth * scale;
  const scaledHeight = slabHeight * scale;

  return {
    x: (viewportWidth - scaledWidth) / 2,
    y: (viewportHeight - scaledHeight) / 2,
  };
}

/**
 * Calculate distance between two points
 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Check if two rectangles overlap
 */
export function rectanglesOverlap(
  x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number
): boolean {
  return (
    x1 < x2 + w2 &&
    x1 + w1 > x2 &&
    y1 < y2 + h2 &&
    y1 + h1 > y2
  );
}

/**
 * Check if a rectangle is completely within bounds
 */
export function isWithinBounds(
  x: number, y: number, width: number, height: number,
  boundsWidth: number, boundsHeight: number,
  padding: number = 0
): boolean {
  return (
    x >= padding &&
    y >= padding &&
    x + width <= boundsWidth - padding &&
    y + height <= boundsHeight - padding
  );
}

/**
 * Rotate a point around a center
 */
export function rotatePoint(
  x: number, y: number,
  centerX: number, centerY: number,
  rotationDegrees: number
): { x: number; y: number } {
  const radians = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const dx = x - centerX;
  const dy = y - centerY;

  return {
    x: centerX + dx * cos - dy * sin,
    y: centerY + dx * sin + dy * cos,
  };
}
