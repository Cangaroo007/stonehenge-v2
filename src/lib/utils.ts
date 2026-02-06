import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | null | undefined): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (num === null || num === undefined || isNaN(num)) return '$0.00';
  
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(num);
}

export function formatNumber(num: number | string | null | undefined, decimals = 2): string {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (n === null || n === undefined || isNaN(n)) return '0';
  return n.toFixed(decimals);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function calculateArea(lengthMm: number, widthMm: number): number {
  return (lengthMm * widthMm) / 1000000; // Convert mm² to m²
}

export function generateQuoteNumber(lastNumber: string | null): string {
  const prefix = 'Q-';
  if (!lastNumber) {
    return `${prefix}00001`;
  }
  
  const numPart = lastNumber.replace(prefix, '');
  const nextNum = parseInt(numPart, 10) + 1;
  return `${prefix}${nextNum.toString().padStart(5, '0')}`;
}

export function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'draft':
      return 'bg-gray-100 text-gray-800';
    case 'sent':
      return 'bg-blue-100 text-blue-800';
    case 'accepted':
      return 'bg-green-100 text-green-800';
    case 'declined':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
