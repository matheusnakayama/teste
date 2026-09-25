import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import Pusher from 'pusher';
import { verifyRoomSession } from '@/lib/roomSession';

export const runtime = 'nodejs';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function getPusherServer() {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!appId || !key || !secret || !cluster) return null;
  return new Pusher({ appId, key, secret, cluster, useTLS: true });
}

function parseClientPayload(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { roomId?: unknown; userId?: unknown; sessionToken?: unknown };
    if (
      typeof parsed.roomId !== 'string' || !/^[a-z0-9-]{4,64}$/.test(parsed.roomId) ||
      typeof parsed.userId !== 'string' || parsed.userId.length < 1 || parsed.userId.length > 100 ||
      typeof parsed.sessionToken !== 'string' || parsed.sessionToken.length > 2048
    ) return null;
    return { roomId: parsed.roomId, userId: parsed.userId, sessionToken: parsed.sessionToken };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'O armazenamento de imagens ainda não foi configurado na Vercel.' }, { status: 503 });
  }
  const pusher = getPusherServer();
  if (!pusher) {
    return NextResponse.json({ error: 'A configuração do Pusher está incompleta.' }, { status: 503 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: 'Solicitação de envio inválida.' }, { status: 400 });
  }

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const identity = parseClientPayload(clientPayload);
        if (
          !identity ||
          !verifyRoomSession(identity.roomId, identity.userId, identity.sessionToken) ||
          !pathname.startsWith(`chat/${identity.roomId}/`) ||
          pathname.includes('..')
        ) {
          throw new Error('Envio de imagem inválido.');
        }

        // Só libera o token temporário a alguém que está conectado àquela sala.
        const presence = await pusher.get({ path: `/channels/presence-room-${identity.roomId}/users` });
        if (presence.status !== 200) throw new Error('Não foi possível confirmar sua presença na sala.');
        const presenceBody = await presence.json() as { users?: Array<{ id?: string }> };
        if (!presenceBody.users?.some((user) => user.id === identity.userId)) {
          throw new Error('Entre na sala antes de enviar uma imagem.');
        }

        return {
          addRandomSuffix: true,
          allowedContentTypes: ALLOWED_IMAGE_TYPES,
          maximumSizeInBytes: MAX_IMAGE_SIZE,
          tokenPayload: JSON.stringify(identity),
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error('Erro no envio de imagem do chat:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível preparar o envio da imagem.' },
      { status: 400 }
    );
  }
}
