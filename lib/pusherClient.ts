'use client';

import Pusher, { type Channel } from 'pusher-js';

let pusherInstance: Pusher | null = null;

export class PusherConfigError extends Error {}

export function getPusherClient(userName: string, userId: string): Pusher {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!key || !cluster) {
    throw new PusherConfigError(
      'A sinalização não está configurada. Defina NEXT_PUBLIC_PUSHER_KEY e NEXT_PUBLIC_PUSHER_CLUSTER (veja .env.example).'
    );
  }

  if (!pusherInstance) {
    pusherInstance = new Pusher(key, {
      cluster,
      authEndpoint: '/api/pusher/auth',
      auth: {
        params: { user_name: userName, user_id: userId },
      },
      // O canal é "presence-*" para sabermos quem está na sala em tempo real.
    });
  }
  return pusherInstance;
}

export function subscribeToRoom(roomId: string, userName: string, userId: string): Channel {
  const pusher = getPusherClient(userName, userId);
  const channelName = `presence-room-${roomId}`;
  return pusher.channel(channelName) ?? pusher.subscribe(channelName);
}

export function disconnectPusher() {
  if (pusherInstance) {
    pusherInstance.disconnect();
    pusherInstance = null;
  }
}
