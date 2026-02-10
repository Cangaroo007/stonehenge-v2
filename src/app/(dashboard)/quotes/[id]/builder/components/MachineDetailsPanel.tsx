'use client';

import { useState } from 'react';

interface MachineOption {
  id: string;
  name: string;
  kerfWidthMm: number;
  isDefault: boolean;
}

interface MachineOperationDefault {
  id: string;
  operationType: string;
  machineId: string;
  machine: {
    id: string;
    name: string;
    kerfWidthMm: number;
  };
}

interface MachineDetailsPanelProps {
  machines: MachineOption[];
  machineOperationDefaults: MachineOperationDefault[];
  overrides: Record<string, string>;
  onOverrideChange: (operationType: string, machineId: string) => void;
}

const OPERATION_LABELS: Record<string, { label: string; description: string }> = {
  INITIAL_CUT: {
    label: 'Initial Cut',
    description: 'Primary slab cutting — kerf affects nesting',
  },
  EDGE_POLISHING: {
    label: 'Edge Polishing',
    description: 'Finished edge polishing',
  },
  MITRING: {
    label: 'Mitring',
    description: 'Mitre cuts for laminated edges',
  },
  LAMINATION: {
    label: 'Lamination',
    description: 'Lamination strip bonding',
  },
  CUTOUT: {
    label: 'Cutouts',
    description: 'Sink, cooktop, and tap hole cutouts',
  },
};

const OPERATION_ORDER = ['INITIAL_CUT', 'EDGE_POLISHING', 'MITRING', 'LAMINATION', 'CUTOUT'];

export default function MachineDetailsPanel({
  machines,
  machineOperationDefaults,
  overrides,
  onOverrideChange,
}: MachineDetailsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const activeMachines = machines.filter(m => m.isDefault !== undefined);

  const getEffectiveMachineId = (operationType: string): string | null => {
    // Check override first
    if (overrides[operationType]) {
      return overrides[operationType];
    }
    // Fall back to operation default
    const opDefault = machineOperationDefaults.find(d => d.operationType === operationType);
    return opDefault?.machineId ?? null;
  };

  const getEffectiveMachine = (operationType: string): MachineOption | null => {
    const machineId = getEffectiveMachineId(operationType);
    if (!machineId) return null;
    return machines.find(m => m.id === machineId) ?? null;
  };

  const isOverridden = (operationType: string): boolean => {
    if (!overrides[operationType]) return false;
    const opDefault = machineOperationDefaults.find(d => d.operationType === operationType);
    return opDefault ? overrides[operationType] !== opDefault.machineId : true;
  };

  return (
    <div className="card">
      {/* Toggle Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 text-gray-500 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">Machine Details</span>
        </div>
        <span className="text-xs text-gray-500">
          {isExpanded ? 'Hide' : 'Show'}
        </span>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-gray-500">
            Override the default machine for each fabrication operation. Changes to the cutting machine will update the kerf width used for slab optimisation.
          </p>

          {OPERATION_ORDER.map((opType) => {
            const meta = OPERATION_LABELS[opType];
            const effectiveMachine = getEffectiveMachine(opType);
            const overridden = isOverridden(opType);
            const currentMachineId = getEffectiveMachineId(opType);

            return (
              <div
                key={opType}
                className={`rounded-lg border p-3 ${
                  overridden ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">
                      {meta?.label ?? opType}
                    </span>
                    {overridden && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
                        OVERRIDE
                      </span>
                    )}
                    {opType === 'INITIAL_CUT' && effectiveMachine && (
                      <span className="text-[10px] text-gray-500 font-medium">
                        ({effectiveMachine.kerfWidthMm}mm kerf)
                      </span>
                    )}
                  </div>
                  {overridden && (
                    <button
                      onClick={() => {
                        const opDefault = machineOperationDefaults.find(d => d.operationType === opType);
                        if (opDefault) {
                          onOverrideChange(opType, opDefault.machineId);
                        }
                      }}
                      className="text-[10px] text-blue-600 hover:text-blue-800 underline"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-2">{meta?.description}</p>
                <select
                  value={currentMachineId || ''}
                  onChange={(e) => onOverrideChange(opType, e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                >
                  <option value="">No machine assigned</option>
                  {activeMachines.map((machine) => (
                    <option key={machine.id} value={machine.id}>
                      {machine.name} ({machine.kerfWidthMm}mm kerf)
                    </option>
                  ))}
                </select>
              </div>
            );
          })}

          {machineOperationDefaults.length === 0 && (
            <div className="text-center py-4 text-gray-500">
              <p className="text-sm">No machine defaults configured.</p>
              <p className="text-xs mt-1">
                Set defaults in{' '}
                <a href="/admin/pricing" className="text-primary-600 underline hover:text-primary-700">
                  Pricing Admin
                </a>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
