'use client';

import type { Participant } from '@/lib/types';
import VideoTile from './VideoTile';

export default function ParticipantsGrid({ participants }: { participants: Participant[] }) {
  const count = participants.length;
  const cols = count <= 1 ? 'grid-cols-1' : count <= 4 ? 'grid-cols-2' : count <= 9 ? 'grid-cols-3' : 'grid-cols-4';

  return (
    <div className={`grid ${cols} gap-3 auto-rows-fr w-full h-full content-center`}>
      {participants.map((p) => (
        <VideoTile key={p.id} participant={p} />
      ))}
    </div>
  );
}
