'use client';

import { useState } from 'react';
import QuoteLayout from '@/components/quotes/QuoteLayout';
import type { QuoteTab } from '@/components/quotes/QuoteLayout';
import QuoteForm from '@/components/QuoteForm';

interface NewQuoteClientProps {
  customers: any[];
  materials: any[];
  pricingRules: any[];
  edgeTypes: any[];
  nextQuoteNumber: string;
  userId?: number;
}

export default function NewQuoteClient({
  customers,
  materials,
  pricingRules,
  edgeTypes,
  nextQuoteNumber,
  userId,
}: NewQuoteClientProps) {
  const [activeTab, setActiveTab] = useState<QuoteTab>('pieces');

  return (
    <QuoteLayout
      quoteNumber={nextQuoteNumber}
      projectName={null}
      status="draft"
      customerName={null}
      mode="edit"
      onModeChange={() => {}}
      showModeToggle={false}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      <QuoteForm
        customers={customers}
        materials={materials}
        pricingRules={pricingRules}
        edgeTypes={edgeTypes}
        nextQuoteNumber={nextQuoteNumber}
        userId={userId}
      />
    </QuoteLayout>
  );
}
