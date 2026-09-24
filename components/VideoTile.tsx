'use client';

import { useEffect, useRef } from 'react';
import type { Participant } from '@/lib/types';
import { MicIcon, ScreenShareIcon } from './icons';

export default function VideoTile({ participant }: { participant: Participant }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      if (videoRef.current.srcObject !== participant.stream) {
        videoRef.current.srcObject = participant.stream;
      }
    }
  }, [participant.stream]);

  const showVideo = participant.camOn && participant.stream;

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-surface-card border transition-shadow ${
        participant.isSpeaking ? 'border-success/70 shadow-[0_0_0_3px_rgba(34,197,94,0.25)]' : 'border-surface-border'
      }`}
    >
      <div className="aspect-video w-full h-full">
        {showVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={participant.isLocal}
            className={`h-full w-full object-cover ${participant.isLocal ? 'scale-x-[-1]' : ''}`}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-surface-card to-surface">
            <Avatar name={participant.name} />
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-2.5 py-2 bg-gradient-to-t from-black/60 to-transparent">
        <span className="text-xs sm:text-sm font-medium text-white truncate flex items-center gap-1.5">
          {participant.isSharingScreen && <ScreenShareIcon active />}
          {participant.name}
          {participant.isLocal && ' (você)'}
        </span>
        {!participant.micOn && (
          <span className="shrink-0 h-6 w-6 rounded-full bg-danger/90 flex items-center justify-center text-white">
            <MicIcon off />
          </span>
        )}
      </div>

      {participant.connectionState === 'connecting' && (
        <div className="absolute top-2 left-2 text-[11px] font-medium text-white/80 bg-black/50 rounded-full px-2 py-0.5">
          Conectando…
        </div>
      )}
      {(participant.connectionState === 'disconnected' || participant.connectionState === 'failed') && (
        <div className="absolute top-2 left-2 text-[11px] font-medium text-warn bg-black/60 rounded-full px-2 py-0.5">
          Conexão instável
        </div>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-brand-600 flex items-center justify-center text-xl sm:text-2xl font-semibold text-white">
      {initial}
    </div>
  );
}
