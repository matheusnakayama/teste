'use client';

import { useState } from 'react';
import { CamIcon, ChatIcon, CheckIcon, HangupIcon, LinkIcon, MicIcon, PeopleIcon, ScreenShareIcon } from './icons';

export type ScreenResolution = 480 | 720 | 1080 | 1440 | 2160;
export type ScreenFrameRate = 30 | 60 | 90 | 120;
export interface ScreenShareSettings {
  height: ScreenResolution;
  frameRate: ScreenFrameRate;
}

const RESOLUTIONS: ScreenResolution[] = [480, 720, 1080, 1440, 2160];
const FRAME_RATES: ScreenFrameRate[] = [30, 60, 90, 120];

export default function Controls({
  micOn,
  camOn,
  sharingScreen,
  screenShareSettings,
  onScreenShareSettingsChange,
  participantCount,
  chatUnreadCount,
  isHost,
  micLockedByHost,
  onToggleMic,
  onToggleCam,
  onToggleScreenShare,
  onLeave,
  onCopyLink,
  onToggleParticipants,
  onToggleChat,
}: {
  micOn: boolean;
  camOn: boolean;
  sharingScreen: boolean;
  screenShareSettings: ScreenShareSettings;
  onScreenShareSettingsChange: (settings: ScreenShareSettings) => void;
  participantCount: number;
  chatUnreadCount: number;
  isHost: boolean;
  micLockedByHost: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreenShare: () => void;
  onLeave: () => void;
  onCopyLink: () => void;
  onToggleParticipants: () => void;
  onToggleChat: () => void;
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
        disabled={micLockedByHost}
        title={micLockedByHost ? 'O anfitrião bloqueou seu microfone' : undefined}
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

      <div className="flex items-center gap-2">
        <label className="w-36 rounded-2xl border border-surface-border bg-surface-card px-3 py-2 text-xs text-white/75 sm:w-44">
          <span className="flex items-center justify-between gap-2">
            <span>Resolução</span>
            <output className="font-semibold text-white">
              {screenShareSettings.height === 2160 ? '4K' : `${screenShareSettings.height}p`}
            </output>
          </span>
          <input
            type="range"
            min="0"
            max={RESOLUTIONS.length - 1}
            step="1"
            value={RESOLUTIONS.indexOf(screenShareSettings.height)}
            disabled={sharingScreen}
            aria-label="Resolução da apresentação, de 480p a 4K"
            title="Escolha a resolução antes de apresentar. O dispositivo e a conexão podem limitar o resultado."
            onChange={(event) => onScreenShareSettingsChange({
              ...screenShareSettings,
              height: RESOLUTIONS[Number(event.target.value)],
            })}
            className="mt-1.5 h-1.5 w-full cursor-pointer accent-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="mt-0.5 flex justify-between text-[9px] text-white/40"><span>480p</span><span>4K</span></span>
        </label>

        <label className="w-28 rounded-2xl border border-surface-border bg-surface-card px-3 py-2 text-xs text-white/75 sm:w-36">
          <span className="flex items-center justify-between gap-2">
            <span>Quadros</span>
            <output className="font-semibold text-white">{screenShareSettings.frameRate} fps</output>
          </span>
          <input
            type="range"
            min="0"
            max={FRAME_RATES.length - 1}
            step="1"
            value={FRAME_RATES.indexOf(screenShareSettings.frameRate)}
            disabled={sharingScreen}
            aria-label="Taxa de quadros da apresentação, de 30 a 120 fps"
            title="Escolha a taxa de quadros antes de apresentar. O dispositivo e a conexão podem limitar o resultado."
            onChange={(event) => onScreenShareSettingsChange({
              ...screenShareSettings,
              frameRate: FRAME_RATES[Number(event.target.value)],
            })}
            className="mt-1.5 h-1.5 w-full cursor-pointer accent-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="mt-0.5 flex justify-between text-[9px] text-white/40"><span>30 fps</span><span>120 fps</span></span>
        </label>
      </div>

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
        onClick={onToggleChat}
        aria-label={chatUnreadCount ? `Abrir chat, ${chatUnreadCount} mensagens não lidas` : 'Abrir chat da chamada'}
        title="Chat da chamada"
        className="relative h-12 w-12 rounded-full bg-surface-card hover:bg-surface-border border border-surface-border flex items-center justify-center text-white transition-colors"
      >
        <ChatIcon />
        {chatUnreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800 px-1 text-[10px] font-semibold flex items-center justify-center">
            {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
          </span>
        )}
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
  disabled,
  title,
  children,
}: {
  active: boolean;
  danger?: boolean;
  highlight?: boolean;
  activeLabel: string;
  inactiveLabel: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={active ? activeLabel : inactiveLabel}
      aria-pressed={!active}
      className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors border disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? 'bg-danger hover:bg-red-600 border-transparent text-white'
          : highlight
          ? 'bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 hover:brightness-110 border-transparent text-white'
          : 'bg-surface-card hover:bg-surface-border border-surface-border text-white'
      }`}
    >
      {children}
    </button>
  );
}
