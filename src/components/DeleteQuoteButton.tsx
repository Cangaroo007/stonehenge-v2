'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface DeleteQuoteButtonProps {
  quoteId: number;
}

export default function DeleteQuoteButton({ quoteId }: DeleteQuoteButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this quote? This action cannot be undone.')) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('Quote deleted');
        router.push('/quotes');
        router.refresh();
      } else {
        toast.error('Failed to delete quote');
      }
    } catch {
      toast.error('An error occurred');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="btn-danger"
    >
      {deleting ? 'Deleting...' : 'Delete'}
    </button>
  );
}
