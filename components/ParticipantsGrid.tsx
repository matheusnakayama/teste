'use client';

import type { Participant } from '@/lib/types';
import VideoTile from './VideoTile';

export default function ParticipantsGrid({
  participants,
  muteRemoteAudio = false,
  focusedParticipantId = null,
  onFocusPresentation,
  onExitPresentationFocus,
}: {
  participants: Participant[];
  muteRemoteAudio?: boolean;
  focusedParticipantId?: string | null;
  onFocusPresentation?: (participantId: string) => void;
  onExitPresentationFocus?: () => void;
}) {
  const focusedParticipant = participants.find((participant) => participant.id === focusedParticipantId && participant.isSharingScreen);
  if (focusedParticipant) {
    return (
      <div className="h-full min-h-0 w-full">
        <VideoTile
          participant={focusedParticipant}
          muteRemoteAudio={muteRemoteAudio}
          focused
          onExitPresentationFocus={onExitPresentationFocus}
        />
      </div>
    );
  }

  const count = participants.length;
  const cols = count <= 1 ? 'grid-cols-1' : count <= 4 ? 'grid-cols-2' : count <= 9 ? 'grid-cols-3' : 'grid-cols-4';

  return (
    <div className={`grid ${cols} gap-3 auto-rows-fr w-full h-full content-center`}>
      {participants.map((p) => (
        <VideoTile
          key={p.id}
          participant={p}
          muteRemoteAudio={muteRemoteAudio}
          onFocusPresentation={() => onFocusPresentation?.(p.id)}
        />
      ))}
    </div>
  );
}
