/**
 * Calculation Cache
 * 
 * Simple in-memory cache for calculation results.
 * Can be extended to use Redis for multi-instance deployments.
 */

import { QuoteCalculation } from '../types';

export class CalculationCache {
  private cache: Map<string, QuoteCalculation> = new Map();
  private ttlMs: number = 5 * 60 * 1000; // 5 minutes default TTL

  constructor(ttlMs?: number) {
    if (ttlMs) {
      this.ttlMs = ttlMs;
    }
  }

  /**
   * Get cached calculation result
   */
  async get(quoteId: string): Promise<QuoteCalculation | null> {
    const key = this.getKey(quoteId);
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }

    // Check if expired
    const age = Date.now() - cached.calculated_at.getTime();
    if (age > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return cached;
  }

  /**
   * Store calculation result in cache
   */
  async set(quoteId: string, calculation: QuoteCalculation): Promise<void> {
    const key = this.getKey(quoteId);
    this.cache.set(key, calculation);
  }

  /**
   * Invalidate cached result for a quote
   */
  async invalidate(quoteId: string): Promise<void> {
    const key = this.getKey(quoteId);
    this.cache.delete(key);
  }

  /**
   * Clear all cached results
   */
  async clear(): Promise<void> {
    this.cache.clear();
  }

  /**
   * Get cache key for a quote
   */
  private getKey(quoteId: string): string {
    return `calc:${quoteId}`;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; ttlMs: number } {
    return {
      size: this.cache.size,
      ttlMs: this.ttlMs,
    };
  }
}

/**
 * Singleton cache instance
 */
let globalCache: CalculationCache | null = null;

export function getCalculationCache(): CalculationCache {
  if (!globalCache) {
    globalCache = new CalculationCache();
  }
  return globalCache;
}
