'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Mic, MicOff, PhoneOff, Video, VideoOff, MonitorUp, Users, Copy, Check } from 'lucide-react';
import { Badge, Button, PageHeader, SetupRequired } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

interface JoinResponse {
  token: string;
  url: string;
  roomName: string;
}

interface MeetingInfo {
  id: string;
  title: string;
  description: string | null;
  status: string;
  roomName: string;
  externalUrl: string | null;
  hostId: string;
  host: { id: string; displayName: string | null };
}

export default function MeetingRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [joinState, setJoinState] = useState<'idle' | 'joining' | 'joined' | 'setup-required' | 'error'>('idle');
  const [setupMessage, setSetupMessage] = useState('');
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const loadMeeting = useCallback(async () => {
    try {
      const data = await api.get<{ meeting: MeetingInfo }>(`/api/meetings/${params.id}`);
      setMeeting(data.meeting);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load meeting');
      router.push('/meetings');
    }
  }, [params.id, router]);

  useEffect(() => {
    void loadMeeting();
  }, [loadMeeting]);

  const join = useCallback(async () => {
    setJoinState('joining');
    try {
      const res = await api.post<JoinResponse>(`/api/meetings/${params.id}/join`);
      // dynamic import keeps livekit-client out of the initial bundle of other pages
      const { Room, RoomEvent, Track } = await import('livekit-client');
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: { simulcast: true },
      });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track: any, _pub: any, participant: any) => {
        if (track.kind === Track.Kind.Video || track.kind === 'video') {
          const el = track.attach();
          el.className = 'h-full w-full rounded-xl object-cover';
          containerRef.current?.appendChild(el);
        } else if (track.kind === Track.Kind.Audio || track.kind === 'audio') {
          track.attach().play().catch(() => {});
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
        track.detach().forEach((el: HTMLElement) => el.remove());
      });
      room.on(RoomEvent.Disconnected, () => {
        setJoinState('idle');
      });

      await room.connect(res.url, res.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      await room.localParticipant.setCameraEnabled(true);
      if (localVideoRef.current) {
        const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        if (track) track.attach(localVideoRef.current);
      }
      setJoinState('joined');
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 503) {
        setJoinState('setup-required');
        setSetupMessage(e.message);
        setExternalUrl((e.details as { externalUrl?: string } | undefined)?.externalUrl ?? null);
      } else {
        setJoinState('error');
        toast.error(e instanceof ApiClientError ? e.message : 'Failed to join meeting');
      }
    }
  }, [params.id]);

  const leave = async () => {
    try {
      roomRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    roomRef.current = null;
    setJoinState('idle');
    await api.post(`/api/meetings/${params.id}/end`).catch(() => {});
    router.push('/meetings');
  };

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  };

  const toggleCam = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !camOn;
    await room.localParticipant.setCameraEnabled(next);
    setCamOn(next);
  };

  const toggleShare = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      if (!sharing) {
        await room.localParticipant.setScreenShareEnabled(true);
        setSharing(true);
      } else {
        await room.localParticipant.setScreenShareEnabled(false);
        setSharing(false);
      }
    } catch (e) {
      toast.error('Screen sharing was denied or is unavailable');
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!meeting) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="animate-spin text-emerald-400" size={28} /></div>;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={meeting.title}
        description={`${meeting.description ?? 'ARJUN Meet room'} · host: ${meeting.host.displayName ?? '—'}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={meeting.status === 'LIVE' ? 'success' : 'neutral'}>{meeting.status}</Badge>
            <Button variant="secondary" size="sm" onClick={copyLink}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy invite link'}
            </Button>
          </div>
        }
      />

      {joinState === 'setup-required' ? (
        <SetupRequired
          title="ARJUN Meet is not configured"
          description={setupMessage}
          docs="LIVEKIT_URL=ws://localhost:7880 · LIVEKIT_API_KEY=… · LIVEKIT_API_SECRET=… · see docs/MEETINGS.md"
        />
      ) : joinState !== 'joined' ? (
        <div className="card flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
            <Video size={28} className="text-emerald-300" />
          </div>
          <h3 className="font-display text-xl font-semibold">Ready to join?</h3>
          <p className="max-w-md text-sm text-arjun-muted">
            ARJUN Meet runs on LiveKit with end-to-end encrypted media. Your camera and microphone are off until you join.
          </p>
          {meeting.externalUrl && (
            <a href={meeting.externalUrl} target="_blank" rel="noreferrer" className="text-sm text-cyan-300 hover:text-cyan-200">
              Or use the host&apos;s external meeting link ↗
            </a>
          )}
          <Button onClick={join} disabled={joinState === 'joining'} className="mt-2">
            {joinState === 'joining' ? <Loader2 size={16} className="animate-spin" /> : <Video size={16} />}
            {joinState === 'joining' ? 'Connecting…' : 'Join meeting'}
          </Button>
        </div>
      ) : (
        <>
          <div ref={containerRef} className="relative grid min-h-[480px] flex-1 grid-cols-1 gap-3 rounded-2xl border border-arjun-line bg-black/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* local preview */}
            <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-arjun-panel">
              <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-[11px]">You</span>
            </div>
          </div>
          <div className="glass flex items-center justify-center gap-3 rounded-2xl p-4">
            <Button variant={micOn ? 'secondary' : 'danger'} size="icon" onClick={toggleMic} aria-label="Toggle microphone">
              {micOn ? <Mic size={18} /> : <MicOff size={18} />}
            </Button>
            <Button variant={camOn ? 'secondary' : 'danger'} size="icon" onClick={toggleCam} aria-label="Toggle camera">
              {camOn ? <Video size={18} /> : <VideoOff size={18} />}
            </Button>
            <Button variant={sharing ? 'primary' : 'secondary'} size="icon" onClick={toggleShare} aria-label="Share screen">
              <MonitorUp size={18} />
            </Button>
            <Button variant="danger" size="icon" onClick={leave} aria-label="Leave meeting">
              <PhoneOff size={18} />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
