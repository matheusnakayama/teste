'use client';

import { useState } from 'react';
import { CamIcon, CheckIcon, HangupIcon, LinkIcon, MicIcon, PeopleIcon, ScreenShareIcon } from './icons';

export type ScreenShareQuality = 'auto' | '480p30' | '720p30' | '1080p30' | '1080p60';

export default function Controls({
  micOn,
  camOn,
  sharingScreen,
  screenShareQuality,
  onScreenShareQualityChange,
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
  screenShareQuality: ScreenShareQuality;
  onScreenShareQualityChange: (quality: ScreenShareQuality) => void;
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

      <label
        title="A opção ajusta a captura e o perfil de envio. A rede e o computador podem limitar o resultado."
        className="flex h-12 items-center gap-2 rounded-full border border-surface-border bg-surface-card px-3 text-xs text-white/75"
      >
        <span className="hidden sm:inline">Qualidade</span>
        <select
          aria-label="Qualidade da apresentação de tela"
          value={screenShareQuality}
          disabled={sharingScreen}
          onChange={(event) => onScreenShareQualityChange(event.target.value as ScreenShareQuality)}
          title={sharingScreen ? 'Pare a apresentação para mudar a qualidade' : 'Escolha a qualidade antes de apresentar'}
          className="max-w-[112px] bg-transparent text-xs text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="auto" className="bg-surface-card">Automática</option>
          <option value="480p30" className="bg-surface-card">480p · 30 fps</option>
          <option value="720p30" className="bg-surface-card">720p · 30 fps</option>
          <option value="1080p30" className="bg-surface-card">1080p · 30 fps</option>
          <option value="1080p60" className="bg-surface-card">1080p · 60 fps</option>
        </select>
      </label>

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
