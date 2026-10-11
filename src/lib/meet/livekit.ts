/** ARJUN Meet — LiveKit access tokens. Setup-required state when unconfigured. */
import { AccessToken } from 'livekit-server-sdk';
import { env, livekitConfigured } from '../env';
import { SetupRequiredError } from '../api';

export function meetConfigured(): boolean {
  return livekitConfigured;
}

/**
 * Which of the three LiveKit variables are still missing. All three are needed:
 * the secret SIGNS a fresh token per participant, so a URL + key alone cannot
 * get anyone into a room.
 */
export function missingMeetConfig(): string[] {
  const missing: string[] = [];
  if (!env.LIVEKIT_URL) missing.push('LIVEKIT_URL');
  if (!env.LIVEKIT_API_KEY) missing.push('LIVEKIT_API_KEY');
  if (!env.LIVEKIT_API_SECRET) missing.push('LIVEKIT_API_SECRET');
  return missing;
}

export function assertMeetConfigured(): void {
  if (livekitConfigured) return;
  const missing = missingMeetConfig();
  throw new SetupRequiredError(
    'ARJUN Meet',
    missing.length === 3
      ? 'LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET (cloud.livekit.io or self-hosted livekit-server). See docs/MEETINGS.md.'
      : `LiveKit is only partially configured — still missing ${missing.join(', ')}. All three are required: the secret signs a token for each participant, so a URL and key alone cannot admit anyone.`,
  );
}

export interface MeetToken {
  token: string;
  url: string;
  roomName: string;
}

export async function issueMeetingToken(opts: {
  roomName: string;
  identity: string;
  name: string;
  isHost: boolean;
}): Promise<MeetToken> {
  assertMeetConfigured();
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: opts.identity,
    name: opts.name,
    ttl: '2h',
  });
  at.addGrant({
    room: opts.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    ...(opts.isHost ? { roomAdmin: true, roomRecord: true } : {}),
  });
  return { token: await at.toJwt(), url: env.LIVEKIT_URL, roomName: opts.roomName };
}
