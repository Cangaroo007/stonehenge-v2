'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { UnitSystem } from '@/lib/utils/units';

interface UnitContextType {
  unitSystem: UnitSystem;
  setUnitSystem: (system: UnitSystem) => void;
  isLoading: boolean;
}

const UnitContext = createContext<UnitContextType | null>(null);

export function UnitProvider({ children }: { children: ReactNode }) {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('METRIC');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/company/settings')
      .then(res => res.json())
      .then(data => setUnitSystem(data.defaultUnitSystem || 'METRIC'))
      .catch(() => setUnitSystem('METRIC'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <UnitContext.Provider value={{ unitSystem, setUnitSystem, isLoading }}>
      {children}
    </UnitContext.Provider>
  );
}

export function useUnits() {
  const context = useContext(UnitContext);
  if (!context) throw new Error('useUnits must be used within UnitProvider');
  return context;
}
