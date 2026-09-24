'use client';

import type { Participant } from '@/lib/types';
import { CamIcon, MicIcon } from './icons';

export default function ParticipantsPanel({
  participants,
  onClose,
}: {
  participants: Participant[];
  onClose: () => void;
}) {
  return (
    <aside className="fixed inset-y-0 right-0 w-full sm:w-80 bg-surface-soft border-l border-surface-border z-20 flex flex-col animate-fadeIn">
      <div className="flex items-center justify-between px-4 py-4 border-b border-surface-border">
        <h2 className="font-semibold">Participantes ({participants.length})</h2>
        <button
          onClick={onClose}
          aria-label="Fechar lista de participantes"
          className="h-8 w-8 rounded-full hover:bg-surface-border flex items-center justify-center text-white/70"
        >
          ✕
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 py-2">
        {participants.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg hover:bg-white/5"
          >
            <div className="h-9 w-9 rounded-full bg-brand-600 flex items-center justify-center text-sm font-semibold shrink-0">
              {p.name.trim().charAt(0).toUpperCase() || '?'}
            </div>
            <span className="flex-1 truncate text-sm">
              {p.name}
              {p.isLocal && ' (você)'}
            </span>
            <span className={`${p.micOn ? 'text-white/40' : 'text-danger'}`}>
              <MicIcon off={!p.micOn} />
            </span>
            <span className={`${p.camOn ? 'text-white/40' : 'text-white/25'}`}>
              <CamIcon off={!p.camOn} />
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
