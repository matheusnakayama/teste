import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

interface RoomSessionClaims {
  roomId: string;
  userId: string;
  expiresAt: number;
}

function getSigningSecret() {
  const secret = process.env.PUSHER_SECRET;
  if (!secret) throw new Error('PUSHER_SECRET não está configurado.');
  return secret;
}

function sign(payload: string) {
  return createHmac('sha256', getSigningSecret()).update(payload).digest('base64url');
}

export function issueRoomSession(roomId: string) {
  const claims: RoomSessionClaims = {
    roomId,
    userId: randomUUID(),
    expiresAt: Date.now() + SESSION_LIFETIME_MS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return { userId: claims.userId, token: `${payload}.${sign(payload)}` };
}

export function verifyRoomSession(roomId: string, userId: string, token: string | null | undefined) {
  if (!token || token.length > 2048) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return false;

  try {
    const expected = Buffer.from(sign(payload), 'base64url');
    const supplied = Buffer.from(signature, 'base64url');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;

    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<RoomSessionClaims>;
    return claims.roomId === roomId && claims.userId === userId &&
      typeof claims.expiresAt === 'number' && claims.expiresAt > Date.now();
  } catch {
    return false;
  }
}
