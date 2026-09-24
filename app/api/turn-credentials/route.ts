import { NextResponse } from 'next/server';
import type { IceServerConfig } from '@/lib/types';

export const runtime = 'nodejs';

const GOOGLE_STUN: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export async function GET() {
  const iceServers: IceServerConfig[] = [...GOOGLE_STUN];

  const meteredKey = process.env.METERED_API_KEY;
  const meteredApp = process.env.METERED_APP_NAME;

  try {
    if (meteredKey && meteredApp) {
      // Gera credenciais TURN de curta duração via API do Metered.ca.
      // Documentação: https://www.metered.ca/docs/turn-credentials-api
      const res = await fetch(
        `https://${meteredApp}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(
          meteredKey
        )}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const servers = (await res.json()) as IceServerConfig[];
        return NextResponse.json({ iceServers: [...iceServers, ...servers] });
      }
    } else if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      iceServers.push({
        urls: process.env.TURN_URL,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    }
  } catch {
    // Se o serviço de TURN falhar, seguimos apenas com STUN — chamadas na mesma
    // rede ou entre redes "abertas" ainda funcionam, mas redes restritivas podem falhar.
  }

  return NextResponse.json({ iceServers });
}
