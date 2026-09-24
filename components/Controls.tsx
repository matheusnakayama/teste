'use client';

import { useState } from 'react';
import { CamIcon, CheckIcon, HangupIcon, LinkIcon, MicIcon, PeopleIcon, ScreenShareIcon } from './icons';

export default function Controls({
  micOn,
  camOn,
  sharingScreen,
  participantCount,
  onToggleMic,
  onToggleCam,
  onToggleScreenShare,
  onLeave,
  onCopyLink,
  onToggleParticipants,
}: {
  micOn: boolean;
  camOn: boolean;
  sharingScreen: boolean;
  participantCount: number;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreenShare: () => void;
  onLeave: () => void;
  onCopyLink: () => void;
  onToggleParticipants: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap px-3">
      <ControlButton
        active={micOn}
        activeLabel="Silenciar microfone"
        inactiveLabel="Ativar microfone"
        onClick={onToggleMic}
        danger={!micOn}
      >
        <MicIcon off={!micOn} />
      </ControlButton>

      <ControlButton
        active={camOn}
        activeLabel="Desligar câmera"
        inactiveLabel="Ligar câmera"
        onClick={onToggleCam}
        danger={!camOn}
      >
        <CamIcon off={!camOn} />
      </ControlButton>

      <ControlButton
        active={!sharingScreen}
        activeLabel="Compartilhar tela"
        inactiveLabel="Parar compartilhamento"
        onClick={onToggleScreenShare}
        highlight={sharingScreen}
      >
        <ScreenShareIcon active={sharingScreen} />
      </ControlButton>

      <button
        onClick={onToggleParticipants}
        aria-label="Ver participantes"
        className="relative h-12 w-12 rounded-full bg-surface-card hover:bg-surface-border border border-surface-border flex items-center justify-center text-white transition-colors"
      >
        <PeopleIcon />
        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-brand-500 text-[11px] font-semibold flex items-center justify-center">
          {participantCount}
        </span>
      </button>

      <button
        onClick={handleCopy}
        aria-label="Copiar link de convite"
        className="h-12 px-4 rounded-full bg-surface-card hover:bg-surface-border border border-surface-border flex items-center gap-2 text-white text-sm font-medium transition-colors"
      >
        {copied ? <CheckIcon /> : <LinkIcon />}
        {copied ? 'Copiado' : 'Convidar'}
      </button>

      <button
        onClick={onLeave}
        aria-label="Sair da chamada"
        className="h-12 w-12 sm:w-auto sm:px-5 rounded-full bg-danger hover:bg-red-600 flex items-center justify-center gap-2 text-white font-semibold transition-colors"
      >
        <HangupIcon />
        <span className="hidden sm:inline">Sair</span>
      </button>
    </div>
  );
}

function ControlButton({
  active,
  danger,
  highlight,
  activeLabel,
  inactiveLabel,
  onClick,
  children,
}: {
  active: boolean;
  danger?: boolean;
  highlight?: boolean;
  activeLabel: string;
  inactiveLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={active ? activeLabel : inactiveLabel}
      aria-pressed={!active}
      className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors border ${
        danger
          ? 'bg-danger hover:bg-red-600 border-transparent text-white'
          : highlight
          ? 'bg-brand-500 hover:bg-brand-400 border-transparent text-white'
          : 'bg-surface-card hover:bg-surface-border border-surface-border text-white'
      }`}
    >
      {children}
    </button>
  );
}
