import { Metadata } from 'next';
import PricingWizard from './wizard';

export const metadata: Metadata = {
  title: 'Pricing Setup Wizard — Stone Henge',
};

export default function WizardPage() {
  return <PricingWizard />;
}
