'use client';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="btn-primary px-6 py-2"
    >
      Print / Save as PDF
    </button>
  );
}
