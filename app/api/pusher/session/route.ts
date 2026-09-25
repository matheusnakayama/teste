import { NextResponse } from 'next/server';
import { issueRoomSession } from '@/lib/roomSession';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { roomId?: unknown };
  try {
    body = await request.json() as { roomId?: unknown };
  } catch {
    return NextResponse.json({ error: 'Sala inválida.' }, { status: 400 });
  }
  const roomId = body.roomId;

  if (typeof roomId !== 'string' || !/^[a-z0-9-]{4,64}$/.test(roomId)) {
    return NextResponse.json({ error: 'Código da sala inválido.' }, { status: 400 });
  }

  try {
    return NextResponse.json(issueRoomSession(roomId));
  } catch {
    return NextResponse.json({ error: 'O servidor não conseguiu autorizar a entrada na sala.' }, { status: 503 });
  }
}
