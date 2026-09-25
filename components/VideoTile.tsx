'use client';

import { useEffect, useRef, useState } from 'react';
import type { Participant } from '@/lib/types';
import { MicIcon, ScreenShareIcon, VolumeIcon } from './icons';

export default function VideoTile({
  participant,
  muteRemoteAudio = false,
}: {
  participant: Participant;
  muteRemoteAudio?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showVolume, setShowVolume] = useState(false);
  const showVideo = (participant.camOn || participant.isSharingScreen) && !!participant.stream;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !participant.stream) return;

    if (video.srcObject !== participant.stream) video.srcObject = participant.stream;
    video.volume = volume;
    // Alguns navegadores bloqueiam o áudio remoto até a pessoa interagir com a
    // página. Tente iniciar a reprodução e ofereça um botão se houver bloqueio.
    void video.play().then(() => setPlaybackBlocked(false)).catch(() => {
      if (!participant.isLocal) setPlaybackBlocked(true);
    });
  }, [participant.isLocal, participant.stream, showVideo, volume]);

  async function enablePlayback() {
    try {
      await videoRef.current?.play();
      setPlaybackBlocked(false);
    } catch {
      setPlaybackBlocked(true);
    }
  }

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-surface-card border transition-shadow ${
        participant.isSpeaking ? 'border-success/70 shadow-[0_0_0_3px_rgba(34,197,94,0.25)]' : 'border-surface-border'
      }`}
    >
      <div className="relative aspect-video w-full h-full bg-gradient-to-br from-surface-card to-surface">
        {participant.stream && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={participant.isLocal || volume === 0 || (muteRemoteAudio && !participant.isLocal)}
            className={`absolute inset-0 h-full w-full object-cover ${showVideo ? '' : 'invisible'} ${participant.isLocal && !participant.isSharingScreen ? 'scale-x-[-1]' : ''}`}
          />
        )}
        {!showVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Avatar name={participant.name} />
          </div>
        )}
      </div>

      {participant.stream && playbackBlocked && !participant.isLocal && (
        <button
          type="button"
          onClick={enablePlayback}
          className="absolute top-3 right-3 rounded-lg bg-black/75 border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-black/90"
        >
          Clique para ativar áudio
        </button>
      )}

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

      {!participant.isLocal && participant.stream?.getAudioTracks().length ? (
        <div className="absolute bottom-10 right-2 flex items-center gap-2 rounded-full bg-black/70 px-2 py-1.5 text-white">
          {showVolume && (
            <input
              aria-label={`Volume de ${participant.name}`}
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="h-1 w-20 accent-blue-400"
            />
          )}
          <button
            type="button"
            onClick={() => setShowVolume((shown) => !shown)}
            aria-label={`Ajustar volume de ${participant.name}`}
            aria-expanded={showVolume}
            className="flex h-6 w-6 items-center justify-center"
          >
            <VolumeIcon muted={volume === 0} />
          </button>
        </div>
      ) : null}

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
