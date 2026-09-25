'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Channel } from 'pusher-js';
import PreJoin from '@/components/PreJoin';
import Controls, { type ScreenShareQuality } from '@/components/Controls';
import ParticipantsGrid from '@/components/ParticipantsGrid';
import ParticipantsPanel from '@/components/ParticipantsPanel';
import ErrorBanner from '@/components/ErrorBanner';
import { subscribeToRoom, disconnectPusher, getPusherClient } from '@/lib/pusherClient';
import { WebRTCManager, type VideoSenderProfile } from '@/lib/webrtc';
import type { CallError, IceServerConfig, Participant } from '@/lib/types';

type Phase = 'pre-join' | 'connecting' | 'in-call' | 'left' | 'fatal-error';

interface PresenceMember {
  id: string;
  info: { name: string; joinedAt: number };
}

interface PresenceMembersSnapshot {
  each: (callback: (member: PresenceMember) => void) => void;
}

export default function RoomClient({ roomId }: { roomId: string }) {
  const [phase, setPhase] = useState<Phase>('pre-join');
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [screenShareQuality, setScreenShareQuality] = useState<ScreenShareQuality>('auto');
  const [screenCaptureInfo, setScreenCaptureInfo] = useState('');
  const [muteRemoteAudioDuringShare, setMuteRemoteAudioDuringShare] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [fatalError, setFatalError] = useState<CallError | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const localIdRef = useRef<string>('');
  const localNameRef = useRef<string>('');
  const participantNamesRef = useRef(new Map<string, string>());
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenAudioContextRef = useRef<AudioContext | null>(null);
  const managerRef = useRef<WebRTCManager | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const camBeforeShareRef = useRef(true);
  const screenShareOperationRef = useRef(false);

  const inviteLink = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/sala/${roomId}`;
  }, [roomId]);

  const cleanup = useCallback(() => {
    managerRef.current?.destroy();
    managerRef.current = null;
    channelRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenAudioContextRef.current?.close().catch(() => {});
    screenAudioContextRef.current = null;
    cameraStreamRef.current = null;
    screenStreamRef.current = null;
    disconnectPusher();
  }, []);

  useEffect(() => cleanup, [cleanup]);

  async function handleJoin(opts: {
    name: string;
    stream: MediaStream | null;
    camOn: boolean;
    micOn: boolean;
  }) {
    setPhase('connecting');
    localNameRef.current = opts.name;
    localIdRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    cameraStreamRef.current = opts.stream;
    setMicOn(opts.micOn);
    setCamOn(opts.camOn);

    setParticipants({
      [localIdRef.current]: {
        id: localIdRef.current,
        name: opts.name,
        stream: opts.stream ?? undefined,
        micOn: opts.micOn,
        camOn: opts.camOn,
        isSpeaking: false,
        isSharingScreen: false,
        isLocal: true,
      },
    });

    try {
      const iceServers = await fetchIceServers();
      const channel = subscribeToRoom(roomId, opts.name, localIdRef.current);
      channelRef.current = channel;

      const manager = new WebRTCManager(channel, localIdRef.current);
      manager.setIceServers(iceServers);
      if (opts.stream) manager.setLocalStream(opts.stream);
      managerRef.current = manager;

      manager.onTrack = (peerId, stream) => {
        setParticipants((prev) => {
          const participant = prev[peerId] ?? createRemoteParticipant(peerId, participantNamesRef.current.get(peerId));
          return { ...prev, [peerId]: { ...participant, stream } };
        });
      };

      manager.onConnectionStateChange = (peerId, state) => {
        setParticipants((prev) => {
          const participant = prev[peerId] ?? createRemoteParticipant(peerId, participantNamesRef.current.get(peerId));
          return { ...prev, [peerId]: { ...participant, connectionState: state } };
        });
        if (state === 'failed' || state === 'disconnected') {
          setBanner('A conexão com um dos participantes ficou instável.');
        }
      };

      manager.onSpeakingChange = (peerId, speaking) => {
        setParticipants((prev) => {
          const participant = prev[peerId] ?? createRemoteParticipant(peerId, participantNamesRef.current.get(peerId));
          return { ...prev, [peerId]: { ...participant, isSpeaking: speaking } };
        });
      };

      manager.onScreenShareState = (peerId, sharing) => {
        setParticipants((prev) => {
          const participant = prev[peerId] ?? createRemoteParticipant(peerId, participantNamesRef.current.get(peerId));
          return { ...prev, [peerId]: { ...participant, isSharingScreen: sharing } };
        });
      };

      manager.onMediaState = (peerId, state) => {
        setParticipants((prev) => {
          const participant = prev[peerId] ?? createRemoteParticipant(peerId, participantNamesRef.current.get(peerId));
          return { ...prev, [peerId]: { ...participant, micOn: state.micOn, camOn: state.camOn } };
        });
      };

      channel.bind('pusher:subscription_succeeded', (members: PresenceMembersSnapshot) => {
        const others: PresenceMember[] = [];
        members.each((m: PresenceMember) => {
          if (m.id !== localIdRef.current) {
            participantNamesRef.current.set(m.id, m.info?.name || 'Convidado');
            others.push(m);
          }
        });

        setParticipants((prev) => {
          const next = { ...prev };
          for (const m of others) {
            const participant = createRemoteParticipant(m.id, m.info?.name || 'Convidado');
            next[m.id] = {
              ...participant,
              ...prev[m.id],
              name: m.info?.name || 'Convidado',
            };
          }
          return next;
        });

        setPhase('in-call');

        // Um lado só inicia a conexão de cada par, evitando ofertas simultâneas.
        others.forEach((m) => {
          if (localIdRef.current < m.id) {
            manager.callPeer(m.id).catch(() => {
              setBanner(`Não foi possível conectar com ${m.info?.name || 'um participante'}.`);
            });
          }
        });
      });

      channel.bind('pusher:member_added', (member: PresenceMember) => {
        const memberName = member.info?.name || 'Convidado';
        participantNamesRef.current.set(member.id, memberName);
        setParticipants((prev) => {
          const participant = createRemoteParticipant(member.id, memberName);
          return {
            ...prev,
            [member.id]: { ...participant, ...prev[member.id], name: memberName },
          };
        });
        if (localIdRef.current < member.id) {
          manager.callPeer(member.id).catch(() => {
            setBanner(`Não foi possível conectar com ${memberName}.`);
          });
        }
        // Avisa o recém-chegado sobre nosso estado atual (ele só recebe eventos futuros).
        manager.broadcastMediaState({ micOn: currentMicRef.current, camOn: currentCamRef.current });
        if (currentSharingRef.current) manager.broadcastScreenShareState(true);
      });

      channel.bind('pusher:member_removed', (member: PresenceMember) => {
        manager.hangupPeer(member.id);
        participantNamesRef.current.delete(member.id);
        setParticipants((prev) => {
          const next = { ...prev };
          delete next[member.id];
          return next;
        });
      });

      channel.bind('pusher:subscription_error', () => {
        cleanup();
        setFatalError({
          kind: 'join-failed',
          message: 'Não foi possível entrar na sala. Verifique sua conexão e tente novamente.',
        });
        setPhase('fatal-error');
      });

      const pusher = getPusherClient(opts.name, localIdRef.current);
      pusher.connection.bind('state_change', (states: { current: string }) => {
        if (states.current === 'unavailable' || states.current === 'failed') {
          setBanner('Sua conexão com o servidor de sinalização está instável.');
        }
      });
    } catch (err) {
      console.error(err);
      cleanup();
      setFatalError({
        kind: 'join-failed',
        message:
          err instanceof Error ? err.message : 'Não foi possível entrar na sala. Tente novamente.',
      });
      setPhase('fatal-error');
    }
  }

  // Refs auxiliares para ler o estado atual dentro de callbacks de eventos do Pusher
  const currentMicRef = useRef(micOn);
  const currentCamRef = useRef(camOn);
  const currentSharingRef = useRef(sharingScreen);
  useEffect(() => {
    currentMicRef.current = micOn;
  }, [micOn]);
  useEffect(() => {
    currentCamRef.current = camOn;
  }, [camOn]);
  useEffect(() => {
    currentSharingRef.current = sharingScreen;
  }, [sharingScreen]);

  function updateLocalParticipant(patch: Partial<Participant>) {
    setParticipants((prev) => {
      const local = prev[localIdRef.current];
      if (!local) return prev;
      return { ...prev, [localIdRef.current]: { ...local, ...patch } };
    });
  }

  async function setOutgoingScreenAudio(screenAudioTrack: MediaStreamTrack | null) {
    const manager = managerRef.current;
    if (!manager) return false;

    const micTrack = cameraStreamRef.current?.getAudioTracks()[0] ?? null;
    if (!screenAudioTrack) {
      await manager.replaceAudioTrack(micTrack);
      const previousContext = screenAudioContextRef.current;
      screenAudioContextRef.current = null;
      await previousContext?.close().catch(() => {});
      return false;
    }

    const audioContext = new AudioContext();
    let mixedTrack: MediaStreamTrack | null = null;
    try {
      const destination = audioContext.createMediaStreamDestination();
      for (const track of [micTrack, screenAudioTrack]) {
        if (!track) continue;
        const source = audioContext.createMediaStreamSource(new MediaStream([track]));
        source.connect(destination);
      }

      await audioContext.resume();
      mixedTrack = destination.stream.getAudioTracks()[0] ?? null;
      await manager.replaceAudioTrack(mixedTrack);
    } catch (err) {
      await audioContext.close().catch(() => {});
      throw err;
    }

    const previousContext = screenAudioContextRef.current;
    screenAudioContextRef.current = audioContext;
    await previousContext?.close().catch(() => {});
    return !!mixedTrack;
  }

  function toggleMic() {
    const tracks = cameraStreamRef.current?.getAudioTracks() ?? [];
    if (tracks.length === 0) {
      setBanner('Nenhum microfone está ativo. Permita o acesso ao microfone e entre novamente na sala.');
      return;
    }

    const next = !micOn;
    currentMicRef.current = next;
    setMicOn(next);
    tracks.forEach((t) => (t.enabled = next));
    updateLocalParticipant({ micOn: next });
    managerRef.current?.broadcastMediaState({ micOn: next, camOn });
  }

  function toggleCam() {
    if (sharingScreen) return; // câmera fica em segundo plano durante compartilhamento
    const next = !camOn;
    currentCamRef.current = next;
    setCamOn(next);
    cameraStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
    updateLocalParticipant({ camOn: next });
    managerRef.current?.broadcastMediaState({ micOn, camOn: next });
  }

  async function stopScreenShare() {
    // Marque como parado antes de encerrar a faixa: o evento `ended` também é
    // disparado quando a pessoa clica no botão do próprio app.
    if (screenShareOperationRef.current || (!currentSharingRef.current && !screenStreamRef.current)) return;
    screenShareOperationRef.current = true;
    currentSharingRef.current = false;

    const display = screenStreamRef.current;
    screenStreamRef.current = null;

    const camTrack = cameraStreamRef.current?.getVideoTracks()[0] ?? null;
    const restoreCam = camBeforeShareRef.current;
    currentCamRef.current = restoreCam;
    if (camTrack) camTrack.enabled = restoreCam;

    try {
      await managerRef.current?.replaceVideoTrack(camTrack, cameraStreamRef.current);
    } catch (err) {
      console.error('Não foi possível restaurar a câmera após compartilhar a tela:', err);
      setBanner('A tela parou de ser compartilhada, mas não foi possível restaurar a câmera.');
    }

    try {
      await setOutgoingScreenAudio(null);
    } catch (err) {
      console.error('Não foi possível restaurar o microfone após compartilhar a tela:', err);
      setBanner('A apresentação parou, mas não foi possível restaurar o áudio do microfone.');
    }
    display?.getTracks().forEach((track) => track.stop());

    setSharingScreen(false);
    setCamOn(restoreCam);
    updateLocalParticipant({
      isSharingScreen: false,
      stream: cameraStreamRef.current ?? undefined,
      camOn: restoreCam,
    });
    managerRef.current?.broadcastScreenShareState(false);
    managerRef.current?.broadcastMediaState({ micOn: currentMicRef.current, camOn: restoreCam });
    setScreenCaptureInfo('');
    setMuteRemoteAudioDuringShare(false);
    screenShareOperationRef.current = false;
  }

  async function toggleScreenShare() {
    const manager = managerRef.current;
    if (!manager || screenShareOperationRef.current) return;

    if (currentSharingRef.current) {
      await stopScreenShare();
      return;
    }
    screenShareOperationRef.current = true;

    try {
      const displayOptions = {
        video: getScreenVideoConstraints(screenShareQuality),
        audio: { restrictOwnAudio: true },
        // Evita loopback do áudio geral do PC, mas permite áudio da guia ou
        // janela escolhida para compartilhar o conteúdo.
        systemAudio: 'exclude',
        windowAudio: 'window',
        selfBrowserSurface: 'exclude',
      } as unknown as DisplayMediaStreamOptions;
      const display = await navigator.mediaDevices.getDisplayMedia(displayOptions);
      const screenTrack = display.getVideoTracks()[0];
      if (!screenTrack) {
        display.getTracks().forEach((track) => track.stop());
        setBanner('O navegador não forneceu uma faixa de vídeo para compartilhar.');
        return;
      }

      screenStreamRef.current = display;
      camBeforeShareRef.current = currentCamRef.current;
      const profile = getScreenVideoProfile(screenShareQuality);
      if (profile) {
        screenTrack.contentHint = profile.maxFramerate >= 60 ? 'motion' : 'detail';
        try {
          await screenTrack.applyConstraints(getScreenVideoConstraints(screenShareQuality) as MediaTrackConstraints);
        } catch (constraintError) {
          // O fluxo continua usando a melhor qualidade que o navegador conseguiu capturar.
          console.warn('O navegador não aceitou todos os limites de captura escolhidos:', constraintError);
        }
      }
      const settings = screenTrack.getSettings();
      const actualCaptureInfo = formatScreenCaptureSettings(settings, screenShareQuality);
      const displayAudioTrack = display.getAudioTracks()[0] ?? null;
      const displaySurface = (settings as MediaTrackSettings & { displaySurface?: string }).displaySurface;
      const mayContainCallAudio = displaySurface !== 'browser';
      const useLocalMuteFallback = Boolean(displayAudioTrack && mayContainCallAudio);
      setMuteRemoteAudioDuringShare(useLocalMuteFallback);

      try {
        await manager.replaceVideoTrack(screenTrack, display, profile);
      } catch (err) {
        console.error('Não foi possível enviar o compartilhamento de tela:', err);
        display.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
        setMuteRemoteAudioDuringShare(false);
        setScreenCaptureInfo('');
        await manager
          .replaceVideoTrack(
            cameraStreamRef.current?.getVideoTracks()[0] ?? null,
            cameraStreamRef.current
          )
          .catch(() => {});
        setBanner('A tela foi capturada, mas não foi possível enviá-la aos participantes.');
        return;
      }

      if (displayAudioTrack) {
        try {
          await setOutgoingScreenAudio(displayAudioTrack);
          setBanner(
            useLocalMuteFallback
              ? 'Para evitar retorno de voz, o áudio dos participantes ficará silenciado para você enquanto esta apresentação estiver ativa.'
              : null
          );
        } catch (err) {
          console.error('Não foi possível misturar o áudio compartilhado:', err);
          await setOutgoingScreenAudio(null).catch(() => {});
          setMuteRemoteAudioDuringShare(false);
          setBanner('A tela será compartilhada, mas o áudio capturado não pôde ser enviado.');
        }
      } else {
        // Em navegadores compatíveis, o áudio vem da guia/janela compartilhada.
        // A captura do áudio geral do sistema fica desativada para impedir que
        // a voz dos participantes volte para eles como áudio da apresentação.
        await manager.replaceAudioTrack(cameraStreamRef.current?.getAudioTracks()[0] ?? null).catch(() => {});
        setBanner('Para compartilhar áudio, escolha uma guia ou janela com som e marque “Compartilhar áudio”. O áudio geral do computador fica desativado para evitar retorno da chamada.');
      }

      currentSharingRef.current = true;
      setSharingScreen(true);
      setScreenCaptureInfo(actualCaptureInfo);
      updateLocalParticipant({ isSharingScreen: true, stream: display, camOn: true });
      manager.broadcastScreenShareState(true);
      // `camOn` também controla se o vídeo remoto é exibido. Durante a
      // apresentação, avise que há vídeo mesmo se a câmera estava desligada.
      manager.broadcastMediaState({ micOn: currentMicRef.current, camOn: true });

      screenTrack.addEventListener('ended', () => {
        // Use a rotina de parada diretamente para não depender do estado React
        // capturado pela função de clique anterior.
        void stopScreenShare();
      }, { once: true });
    } catch (err) {
      console.error('Não foi possível iniciar a apresentação de tela:', err);
      setMuteRemoteAudioDuringShare(false);
      setScreenCaptureInfo('');
      setBanner('Não foi possível compartilhar a tela. Verifique as permissões do navegador.');
    } finally {
      screenShareOperationRef.current = false;
    }
  }

  function handleLeave() {
    cleanup();
    setPhase('left');
  }

  function handleCopyLink() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(inviteLink).catch(() => {});
    }
  }

  const participantList = Object.values(participants);

  if (phase === 'pre-join') {
    return <PreJoin roomId={roomId} onJoin={handleJoin} />;
  }

  if (phase === 'fatal-error') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 gap-4">
        <ErrorBanner
          title="Não foi possível entrar na sala"
          message={fatalError?.message ?? 'Tente novamente em instantes.'}
          onRetry={() => {
            setFatalError(null);
            setPhase('pre-join');
          }}
        />
      </main>
    );
  }

  if (phase === 'left') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 gap-5 text-center">
        <h1 className="text-2xl font-bold">Você saiu da sala</h1>
        <p className="text-white/60 max-w-sm">
          Você pode voltar a qualquer momento usando o mesmo link, enquanto outras pessoas
          continuarem nela.
        </p>
        <div className="flex gap-3">
          <a
            href={`/sala/${roomId}`}
            className="rounded-xl bg-brand-500 hover:bg-brand-400 transition-colors px-5 py-3 font-semibold text-white"
          >
            Entrar novamente
          </a>
          <a
            href="/"
            className="rounded-xl bg-surface-card hover:bg-surface-border border border-surface-border transition-colors px-5 py-3 font-semibold text-white"
          >
            Página inicial
          </a>
        </div>
      </main>
    );
  }

  const isConnecting = phase === 'connecting';

  return (
    <main className="min-h-screen flex flex-col bg-surface">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-surface-border">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <span className="h-2 w-2 rounded-full bg-success animate-speaking" />
          Sala <span className="font-mono text-white/80">{roomId}</span>
        </div>
      </header>

      {banner && (
        <div className="px-4 pt-3">
          <div className="max-w-xl mx-auto">
            <ErrorBanner title="Aviso de conexão" message={banner} onRetry={() => setBanner(null)} />
          </div>
        </div>
      )}

      <section className="flex-1 px-3 sm:px-6 py-4 overflow-hidden">
        {isConnecting ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-white/60 animate-fadeIn">Conectando à sala…</p>
          </div>
        ) : participantList.length <= 1 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
            <div className="max-w-xs">
              <ParticipantsGrid
                participants={participantList}
                muteRemoteAudio={muteRemoteAudioDuringShare}
              />
            </div>
            <p className="text-white/50 text-sm mt-2">
              Você é o único aqui até agora. Compartilhe o link para convidar outras pessoas.
            </p>
          </div>
        ) : (
          <ParticipantsGrid
            participants={participantList}
            muteRemoteAudio={muteRemoteAudioDuringShare}
          />
        )}
      </section>

      <footer className="px-3 sm:px-6 py-4 border-t border-surface-border">
        <Controls
          micOn={micOn}
          camOn={camOn}
          sharingScreen={sharingScreen}
          screenShareQuality={screenShareQuality}
          onScreenShareQualityChange={setScreenShareQuality}
          participantCount={participantList.length}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          onToggleScreenShare={toggleScreenShare}
          onLeave={handleLeave}
          onCopyLink={handleCopyLink}
          onToggleParticipants={() => setShowParticipants((v) => !v)}
        />
        {sharingScreen && screenCaptureInfo && (
          <p className="mt-2 text-center text-xs text-white/55">
            Captura desta tela: {screenCaptureInfo}. O envio também depende da conexão.
          </p>
        )}
      </footer>

      {showParticipants && (
        <ParticipantsPanel participants={participantList} onClose={() => setShowParticipants(false)} />
      )}
    </main>
  );
}

function getScreenVideoConstraints(quality: ScreenShareQuality): boolean | MediaTrackConstraints {
  if (quality === 'auto') return true;
  const profile = getScreenVideoProfile(quality);
  if (!profile) return true;
  return {
    width: { ideal: profile.width, max: profile.width },
    height: { ideal: profile.height, max: profile.height },
    frameRate: { ideal: profile.maxFramerate, max: profile.maxFramerate },
  };
}

function getScreenVideoProfile(
  quality: ScreenShareQuality
): (VideoSenderProfile & { width: number; height: number }) | null {
  if (quality === 'auto') return null;
  const profiles: Record<Exclude<ScreenShareQuality, 'auto'>, VideoSenderProfile & { width: number; height: number }> = {
    '480p30': { width: 854, height: 480, maxFramerate: 30, maxBitrate: 1_200_000 },
    '720p30': { width: 1280, height: 720, maxFramerate: 30, maxBitrate: 2_500_000 },
    '1080p30': { width: 1920, height: 1080, maxFramerate: 30, maxBitrate: 5_000_000 },
    '1080p60': { width: 1920, height: 1080, maxFramerate: 60, maxBitrate: 8_000_000 },
  };
  return profiles[quality];
}

function formatScreenCaptureSettings(settings: MediaTrackSettings, quality: ScreenShareQuality) {
  const profile = getScreenVideoProfile(quality);
  const dimensions = settings.width && settings.height
    ? `${settings.width} × ${settings.height}`
    : profile
      ? `até ${profile.width} × ${profile.height} (solicitado)`
      : 'resolução automática';
  const frameRate = settings.frameRate ? `${Math.round(settings.frameRate)} fps` :
    profile ? `até ${profile.maxFramerate} fps (solicitado)` : 'fps não informado';
  return `${dimensions} · ${frameRate}`;
}

async function fetchIceServers(): Promise<IceServerConfig[]> {
  try {
    const res = await fetch('/api/turn-credentials');
    if (!res.ok) return [{ urls: 'stun:stun.l.google.com:19302' }];
    const data = await res.json();
    return data.iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }];
  } catch {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
}

function createRemoteParticipant(id: string, name = 'Convidado'): Participant {
  return {
    id,
    name,
    micOn: true,
    camOn: true,
    isSpeaking: false,
    isSharingScreen: false,
    isLocal: false,
    connectionState: 'connecting',
  };
}
