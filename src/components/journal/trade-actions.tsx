'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

export function TradeActions({ tradeId }: { tradeId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const del = async () => {
    setDeleting(true);
    try {
      await api.del(`/api/trades/${tradeId}`);
      toast.success('Trade deleted');
      router.push('/journal');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to delete');
      setDeleting(false);
    }
  };

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>
        <Trash2 size={14} /> Delete
      </Button>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Delete this trade?" description="This permanently removes the journal entry and its screenshots.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="danger" onClick={del} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete trade'}</Button>
        </div>
      </Modal>
    </>
  );
}
