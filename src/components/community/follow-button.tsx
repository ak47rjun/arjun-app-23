'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';
import { toast } from 'sonner';

export function FollowButton({ targetId, initialFollowing }: { targetId: string; initialFollowing: boolean }) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const toggle = async () => {
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      if (next) await api.post(`/api/users/${targetId}/follow`);
      else await api.del(`/api/users/${targetId}/follow`);
      router.refresh();
    } catch (e) {
      setFollowing(!next);
      toast.error(e instanceof ApiClientError ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant={following ? 'secondary' : 'primary'} size="sm" onClick={toggle} disabled={busy}>
      {following ? <><Check size={14} /> Following</> : <><UserPlus size={14} /> Follow</>}
    </Button>
  );
}
