'use client';

import { useEffect, useRef, useState } from 'react';
import { CamIcon, MicIcon } from './icons';
import ErrorBanner from './ErrorBanner';
import type { CallError } from '@/lib/types';

export default function PreJoin({
  roomId,
  onJoin,
}: {
  roomId: string;
  onJoin: (opts: { name: string; stream: MediaStream | null; camOn: boolean; micOn: boolean }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const streamTransferredRef = useRef(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState('');
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [deviceError, setDeviceError] = useState<CallError | null>(null);
  const [loadingDevices, setLoadingDevices] = useState(true);

  async function refreshAudioInputs(preferredDeviceId?: string) {
    try {
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === 'audioinput'
      );
      setAudioInputs(inputs);
      const currentDeviceId =
        preferredDeviceId ?? activeStreamRef.current?.getAudioTracks()[0]?.getSettings().deviceId;
      setSelectedAudioInput(
        inputs.find((device) => device.deviceId === currentDeviceId)?.deviceId ?? inputs[0]?.deviceId ?? ''
      );
    } catch {
      setAudioInputs([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let localStream: MediaStream | null = null;

    async function start() {
      setLoadingDevices(true);
      setDeviceError(null);
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          localStream.getTracks().forEach((t) => t.stop());
          return;
        }
        activeStreamRef.current = localStream;
        setStream(localStream);
        setCamOn(true);
        setMicOn(true);
        void refreshAudioInputs(localStream.getAudioTracks()[0]?.getSettings().deviceId);
      } catch (combinedError) {
        if (cancelled) return;

        // Não deixe a falta/recusa da câmera impedir o uso do microfone.
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          if (cancelled) {
            localStream.getTracks().forEach((t) => t.stop());
            return;
          }
          activeStreamRef.current = localStream;
          setStream(localStream);
          setCamOn(false);
          setMicOn(true);
          void refreshAudioInputs(localStream.getAudioTracks()[0]?.getSettings().deviceId);
        } catch {
          // Ainda tente oferecer a chamada com vídeo se apenas o microfone falhar.
          try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            if (cancelled) {
              localStream.getTracks().forEach((t) => t.stop());
              return;
            }
            activeStreamRef.current = localStream;
            setStream(localStream);
            setCamOn(true);
            setMicOn(false);
            void refreshAudioInputs();
            setDeviceError({
              kind: 'permission-denied',
              message: 'Câmera disponível, mas o microfone não pôde ser acessado.',
            });
          } catch {
            setDeviceError(mapMediaError(combinedError));
          }
        }
      } finally {
        if (!cancelled) setLoadingDevices(false);
      }
    }

    start();
    return () => {
      cancelled = true;
      // Depois de entrar, a sala passa a ser dona das faixas. Encerrá-las aqui
      // desligaria o microfone e a câmera logo após a entrada.
      if (!streamTransferredRef.current) {
        activeStreamRef.current?.getTracks().forEach((t) => t.stop());
      }
      activeStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    stream?.getVideoTracks().forEach((t) => (t.enabled = camOn));
  }, [camOn, stream]);

  useEffect(() => {
    stream?.getAudioTracks().forEach((t) => (t.enabled = micOn));
  }, [micOn, stream]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Digite seu nome para entrar na sala.');
      return;
    }
    const streamToJoin = activeStreamRef.current ?? stream;
    streamTransferredRef.current = true;
    activeStreamRef.current = null;
    onJoin({
      name: trimmed.slice(0, 40),
      stream: streamToJoin,
      camOn: camOn && !!streamToJoin,
      micOn: micOn && !!streamToJoin,
    });
  }

  async function handleAudioInputChange(deviceId: string) {
    if (!deviceId || deviceId === selectedAudioInput) return;

    try {
      const replacement = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false,
      });
      const replacementTrack = replacement.getAudioTracks()[0];
      if (!replacementTrack) throw new Error('O navegador não retornou uma faixa de áudio.');

      const currentStream = activeStreamRef.current;
      const nextStream = new MediaStream([...(currentStream?.getVideoTracks() ?? []), replacementTrack]);
      activeStreamRef.current = nextStream;
      setStream(nextStream);
      setMicOn(true);
      replacementTrack.enabled = true;
      currentStream?.getAudioTracks().forEach((track) => track.stop());
      setSelectedAudioInput(deviceId);
      setDeviceError(null);
    } catch {
      setDeviceError({
        kind: 'permission-denied',
        message: 'Não foi possível usar esse microfone. Confira a permissão do navegador.',
      });
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-4xl grid md:grid-cols-[1.1fr_0.9fr] gap-8 items-center">
        <div>
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-surface-card border border-surface-border">
            {stream && camOn ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover scale-x-[-1]"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                {loadingDevices ? (
                  <p className="text-white/50 text-sm">Preparando câmera…</p>
                ) : (
                  <div className="h-20 w-20 rounded-full bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800 flex items-center justify-center text-2xl font-semibold text-white">
                    {name.trim().charAt(0).toUpperCase() || '?'}
                  </div>
                )}
              </div>
            )}

            <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setMicOn((v) => !v)}
                disabled={!stream?.getAudioTracks().length}
                aria-pressed={!micOn}
                aria-label={micOn ? 'Silenciar microfone' : 'Ativar microfone'}
                className={`h-11 w-11 rounded-full flex items-center justify-center border transition-colors disabled:opacity-40 ${
                  micOn
                    ? 'bg-black/40 border-white/20 text-white hover:bg-black/55'
                    : 'bg-danger border-transparent text-white'
                }`}
              >
                <MicIcon off={!micOn} />
              </button>
              <button
                type="button"
                onClick={() => setCamOn((v) => !v)}
                disabled={!stream}
                aria-pressed={!camOn}
                aria-label={camOn ? 'Desligar câmera' : 'Ligar câmera'}
                className={`h-11 w-11 rounded-full flex items-center justify-center border transition-colors disabled:opacity-40 ${
                  camOn
                    ? 'bg-black/40 border-white/20 text-white hover:bg-black/55'
                    : 'bg-danger border-transparent text-white'
                }`}
              >
                <CamIcon off={!camOn} />
              </button>
            </div>
          </div>

          {deviceError && (
            <div className="mt-4">
              <ErrorBanner title={deviceError.message} message={deviceErrorHint(deviceError.kind)} />
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pronto para entrar?</h1>
            <p className="text-white/50 text-sm mt-1">
              Sala <span className="font-mono text-white/70">{roomId}</span>
            </p>
          </div>

          {audioInputs.length > 0 && (
            <div>
              <label htmlFor="audio-input" className="block text-sm font-medium text-white/70 mb-1.5">
                Microfone
              </label>
              <select
                id="audio-input"
                value={selectedAudioInput}
                onChange={(event) => void handleAudioInputChange(event.target.value)}
                className="w-full rounded-xl bg-surface-card border border-surface-border px-4 py-3 text-white focus:border-brand-400 outline-none"
              >
                {audioInputs.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microfone ${index + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="display-name" className="block text-sm font-medium text-white/70 mb-1.5">
              Seu nome
            </label>
            <input
              id="display-name"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="Como devemos te chamar?"
              className="w-full rounded-xl bg-surface-card border border-surface-border px-4 py-3 text-white placeholder:text-white/35 focus:border-brand-400 outline-none transition-colors"
            />
            {nameError && (
              <p role="alert" className="mt-1.5 text-sm text-danger">
                {nameError}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 hover:brightness-110 transition px-5 py-3.5 font-semibold text-white shadow-lg shadow-brand-900/40"
          >
            Entrar na sala
          </button>

          <p className="text-xs text-white/40 leading-relaxed">
            Ao entrar, seu nome fica visível para as outras pessoas na sala. Você pode
            desligar a câmera ou o microfone a qualquer momento durante a chamada.
          </p>
        </form>
      </div>
    </main>
  );
}

function mapMediaError(err: unknown): CallError {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return {
      kind: 'permission-denied',
      message: 'Acesso à câmera e ao microfone foi negado.',
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      kind: 'device-not-found',
      message: 'Nenhuma câmera ou microfone foi encontrado.',
    };
  }
  return { kind: 'unknown', message: 'Não foi possível acessar seus dispositivos de mídia.' };
}

function deviceErrorHint(kind: CallError['kind']): string {
  switch (kind) {
    case 'permission-denied':
      return 'Confira se o site tem permissão para usar o microfone nas configurações do navegador. Se acabou de liberar, volte e entre novamente.';
    case 'device-not-found':
      return 'Verifique se um dispositivo está conectado. Você ainda pode entrar na sala e participar apenas assistindo.';
    default:
      return 'Verifique se outro aplicativo não está usando a câmera ou o microfone e tente novamente.';
  }
}
