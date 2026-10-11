'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ImagePlus, Loader2 } from 'lucide-react';
import { Button, Select } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

export function ScreenshotUploader({ tradeId }: { tradeId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<'BEFORE' | 'AFTER'>('AFTER');
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('kind', kind);
      await api.upload(`/api/trades/${tradeId}/screenshots`, form);
      toast.success('Screenshot attached');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={kind} onChange={(e) => setKind(e.target.value as never)} className="w-40">
        <option value="AFTER">After exit</option>
        <option value="BEFORE">Before entry</option>
      </Select>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = '';
        }}
      />
      <Button variant="secondary" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} Attach screenshot
      </Button>
    </div>
  );
}
