import { NextRequest, NextResponse } from 'next/server';
import Pusher from 'pusher';
import { verifyRoomSession } from '@/lib/roomSession';

export const runtime = 'nodejs';

function getPusherServer() {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    return null;
  }

  return new Pusher({ appId, key, secret, cluster, useTLS: true });
}

// O navegador envia application/x-www-form-urlencoded (é assim que o pusher-js chama /api/pusher/auth)
export async function POST(req: NextRequest) {
  const pusher = getPusherServer();
  if (!pusher) {
    return NextResponse.json(
      {
        error:
          'Sinalização não configurada no servidor. Defina PUSHER_APP_ID, PUSHER_SECRET, NEXT_PUBLIC_PUSHER_KEY e NEXT_PUBLIC_PUSHER_CLUSTER.',
      },
      { status: 500 }
    );
  }

  const body = await req.text();
  const params = new URLSearchParams(body);
  const socketId = params.get('socket_id');
  const channelName = params.get('channel_name');
  const userName = params.get('user_name')?.slice(0, 60) || 'Convidado';
  const userId = params.get('user_id') || '';
  const roomSession = params.get('room_session');
  const roomId = channelName?.startsWith('presence-room-') ? channelName.slice('presence-room-'.length) : '';

  if (!socketId || !channelName || !/^[a-z0-9-]{4,64}$/.test(roomId) || !userId) {
    return NextResponse.json({ error: 'Parâmetros ausentes.' }, { status: 400 });
  }

  // Só autorizamos canais de presença de sala (presence-room-*)
  if (channelName !== `presence-room-${roomId}`) {
    return NextResponse.json({ error: 'Canal não permitido.' }, { status: 403 });
  }

  if (!verifyRoomSession(roomId, userId, roomSession)) {
    return NextResponse.json({ error: 'Sua sessão da sala expirou. Saia e entre novamente.' }, { status: 403 });
  }

  const presenceData = {
    user_id: userId,
    user_info: { name: userName, joinedAt: Date.now() },
  };

  const authResponse = pusher.authorizeChannel(socketId, channelName, presenceData);
  return NextResponse.json(authResponse);
}
