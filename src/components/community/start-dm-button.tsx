'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';
import { toast } from 'sonner';

export function StartDmButton({ targetId }: { targetId: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const start = async () => {
    setBusy(true);
    try {
      const { conversation } = await api.post<{ conversation: { id: string } }>('/api/conversations', { type: 'DM', userId: targetId });
      router.push(`/messages/${conversation.id}`);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Could not start conversation');
      setBusy(false);
    }
  };

  return (
    <Button variant="secondary" size="sm" onClick={start} disabled={busy}>
      <MessageSquare size={14} /> Message
    </Button>
  );
}
