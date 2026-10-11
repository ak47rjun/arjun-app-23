/** ARJUN Meet — LiveKit access tokens. Setup-required state when unconfigured. */
import { AccessToken } from 'livekit-server-sdk';
import { env, livekitConfigured } from '../env';
import { SetupRequiredError } from '../api';

export function meetConfigured(): boolean {
  return livekitConfigured;
}

export function assertMeetConfigured(): void {
  if (!livekitConfigured) {
    throw new SetupRequiredError(
      'ARJUN Meet',
      'LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET (cloud.livekit.io or self-hosted livekit-server). See docs/MEETINGS.md.',
    );
  }
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
