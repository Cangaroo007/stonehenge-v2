import React from 'react';
import { LayoutStatsProps } from './types';

export const LayoutStats: React.FC<LayoutStatsProps> = ({ calculation, compact }) => {
  if (compact) {
    return (
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Pieces:</span>
          <span className="font-semibold">{calculation.placedPieces}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Utilization:</span>
          <span className={`font-semibold ${
            calculation.utilizationPercent > 80 ? 'text-green-600' : 
            calculation.utilizationPercent > 60 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {calculation.utilizationPercent}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Waste:</span>
          <span className="font-semibold">{calculation.wastePercent}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white border rounded-lg shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Layout Statistics</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500">Pieces Placed</p>
            <p className="text-lg font-semibold">{calculation.placedPieces}</p>
          </div>
          
          <div>
            <p className="text-xs text-gray-500">Total Slab Area</p>
            <p className="text-lg font-semibold">{calculation.totalSlabAreaSqm.toFixed(2)} m²</p>
          </div>
          
          <div>
            <p className="text-xs text-gray-500">Used Area</p>
            <p className="text-lg font-semibold">{calculation.usedAreaSqm.toFixed(2)} m²</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500">Utilization</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${
                    calculation.utilizationPercent > 80 ? 'bg-green-500' : 
                    calculation.utilizationPercent > 60 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${calculation.utilizationPercent}%` }}
                />
              </div>
              <span className={`text-lg font-semibold ${
                calculation.utilizationPercent > 80 ? 'text-green-600' : 
                calculation.utilizationPercent > 60 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {calculation.utilizationPercent}%
              </span>
            </div>
          </div>
          
          <div>
            <p className="text-xs text-gray-500">Waste</p>
            <p className="text-lg font-semibold text-red-600">
              {calculation.wasteAreaSqm.toFixed(2)} m² ({calculation.wastePercent}%)
            </p>
          </div>
          
          <div>
            <p className="text-xs text-gray-500">Remaining Remnants</p>
            <p className="text-lg font-semibold">{calculation.remainingRemnants.length} pieces</p>
          </div>
        </div>
      </div>

      {/* Efficiency indicator */}
      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${
            calculation.utilizationPercent > 85 ? 'bg-green-500' :
            calculation.utilizationPercent > 70 ? 'bg-yellow-500' :
            'bg-red-500'
          }`} />
          <span className="text-sm text-gray-600">
            {calculation.utilizationPercent > 85 ? 'Excellent efficiency' :
             calculation.utilizationPercent > 70 ? 'Good efficiency' :
             'Consider optimizing layout'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default LayoutStats;
