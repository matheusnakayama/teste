'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Channel } from 'pusher-js';
import PreJoin from '@/components/PreJoin';
import Controls from '@/components/Controls';
import ParticipantsGrid from '@/components/ParticipantsGrid';
import ParticipantsPanel from '@/components/ParticipantsPanel';
import ErrorBanner from '@/components/ErrorBanner';
import { subscribeToRoom, disconnectPusher, getPusherClient } from '@/lib/pusherClient';
import { WebRTCManager } from '@/lib/webrtc';
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
  const [showParticipants, setShowParticipants] = useState(false);
  const [fatalError, setFatalError] = useState<CallError | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const localIdRef = useRef<string>('');
  const localNameRef = useRef<string>('');
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const managerRef = useRef<WebRTCManager | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const camBeforeShareRef = useRef(true);

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
          if (!prev[peerId]) return prev;
          return { ...prev, [peerId]: { ...prev[peerId], stream } };
        });
      };

      manager.onConnectionStateChange = (peerId, state) => {
        setParticipants((prev) => {
          if (!prev[peerId]) return prev;
          return { ...prev, [peerId]: { ...prev[peerId], connectionState: state } };
        });
        if (state === 'failed' || state === 'disconnected') {
          setBanner('A conexão com um dos participantes ficou instável.');
        }
      };

      manager.onSpeakingChange = (peerId, speaking) => {
        setParticipants((prev) => {
          if (!prev[peerId]) return prev;
          return { ...prev, [peerId]: { ...prev[peerId], isSpeaking: speaking } };
        });
      };

      manager.onScreenShareState = (peerId, sharing) => {
        setParticipants((prev) => {
          if (!prev[peerId]) return prev;
          return { ...prev, [peerId]: { ...prev[peerId], isSharingScreen: sharing } };
        });
      };

      manager.onMediaState = (peerId, state) => {
        setParticipants((prev) => {
          if (!prev[peerId]) return prev;
          return { ...prev, [peerId]: { ...prev[peerId], micOn: state.micOn, camOn: state.camOn } };
        });
      };

      channel.bind('pusher:subscription_succeeded', (members: PresenceMembersSnapshot) => {
        const others: PresenceMember[] = [];
        members.each((m: PresenceMember) => {
          if (m.id !== localIdRef.current) others.push(m);
        });

        setParticipants((prev) => {
          const next = { ...prev };
          for (const m of others) {
            next[m.id] = {
              id: m.id,
              name: m.info?.name || 'Convidado',
              micOn: true,
              camOn: true,
              isSpeaking: false,
              isSharingScreen: false,
              isLocal: false,
              connectionState: 'connecting',
            };
          }
          return next;
        });

        setPhase('in-call');

        // Somos o novo participante: chamamos quem já estava na sala.
        others.forEach((m) => {
          manager.callPeer(m.id).catch(() => {
            setBanner(`Não foi possível conectar com ${m.info?.name || 'um participante'}.`);
          });
        });
      });

      channel.bind('pusher:member_added', (member: PresenceMember) => {
        setParticipants((prev) => {
          if (prev[member.id]) return prev;
          return {
            ...prev,
            [member.id]: {
              id: member.id,
              name: member.info?.name || 'Convidado',
              micOn: true,
              camOn: true,
              isSpeaking: false,
              isSharingScreen: false,
              isLocal: false,
              connectionState: 'connecting',
            },
          };
        });
        // Avisa o recém-chegado sobre nosso estado atual (ele só recebe eventos futuros).
        manager.broadcastMediaState({ micOn: currentMicRef.current, camOn: currentCamRef.current });
        if (currentSharingRef.current) manager.broadcastScreenShareState(true);
      });

      channel.bind('pusher:member_removed', (member: PresenceMember) => {
        manager.hangupPeer(member.id);
        setParticipants((prev) => {
          const next = { ...prev };
          delete next[member.id];
          return next;
        });
      });

      channel.bind('pusher:subscription_error', () => {
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

  function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    cameraStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
    updateLocalParticipant({ micOn: next });
    managerRef.current?.broadcastMediaState({ micOn: next, camOn });
  }

  function toggleCam() {
    if (sharingScreen) return; // câmera fica em segundo plano durante compartilhamento
    const next = !camOn;
    setCamOn(next);
    cameraStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
    updateLocalParticipant({ camOn: next });
    managerRef.current?.broadcastMediaState({ micOn, camOn: next });
  }

  async function stopScreenShare() {
    // Marque como parado antes de encerrar a faixa: o evento `ended` também é
    // disparado quando a pessoa clica no botão do próprio app.
    if (!currentSharingRef.current && !screenStreamRef.current) return;
    currentSharingRef.current = false;

    const display = screenStreamRef.current;
    screenStreamRef.current = null;
    display?.getTracks().forEach((track) => track.stop());

    const camTrack = cameraStreamRef.current?.getVideoTracks()[0] ?? null;
    const restoreCam = camBeforeShareRef.current;
    if (camTrack) camTrack.enabled = restoreCam;

    try {
      await managerRef.current?.replaceVideoTrack(camTrack);
    } catch (err) {
      console.error('Não foi possível restaurar a câmera após compartilhar a tela:', err);
      setBanner('A tela parou de ser compartilhada, mas não foi possível restaurar a câmera.');
    }

    setSharingScreen(false);
    setCamOn(restoreCam);
    updateLocalParticipant({
      isSharingScreen: false,
      stream: cameraStreamRef.current ?? undefined,
      camOn: restoreCam,
    });
    managerRef.current?.broadcastScreenShareState(false);
    managerRef.current?.broadcastMediaState({ micOn: currentMicRef.current, camOn: restoreCam });
  }

  async function toggleScreenShare() {
    const manager = managerRef.current;
    if (!manager) return;

    if (currentSharingRef.current) {
      await stopScreenShare();
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = display.getVideoTracks()[0];
      if (!screenTrack) {
        display.getTracks().forEach((track) => track.stop());
        setBanner('O navegador não forneceu uma faixa de vídeo para compartilhar.');
        return;
      }

      screenStreamRef.current = display;
      camBeforeShareRef.current = currentCamRef.current;

      try {
        await manager.replaceVideoTrack(screenTrack);
      } catch (err) {
        console.error('Não foi possível enviar o compartilhamento de tela:', err);
        display.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
        await manager.replaceVideoTrack(cameraStreamRef.current?.getVideoTracks()[0] ?? null).catch(() => {});
        setBanner('A tela foi capturada, mas não foi possível enviá-la aos participantes.');
        return;
      }

      currentSharingRef.current = true;
      setSharingScreen(true);
      updateLocalParticipant({ isSharingScreen: true, stream: display, camOn: true });
      manager.broadcastScreenShareState(true);

      screenTrack.addEventListener('ended', () => {
        // Use a rotina de parada diretamente para não depender do estado React
        // capturado pela função de clique anterior.
        void stopScreenShare();
      }, { once: true });
    } catch (err) {
      setBanner('Não foi possível compartilhar a tela. Verifique as permissões do navegador.');
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
              <ParticipantsGrid participants={participantList} />
            </div>
            <p className="text-white/50 text-sm mt-2">
              Você é o único aqui até agora. Compartilhe o link para convidar outras pessoas.
            </p>
          </div>
        ) : (
          <ParticipantsGrid participants={participantList} />
        )}
      </section>

      <footer className="px-3 sm:px-6 py-4 border-t border-surface-border">
        <Controls
          micOn={micOn}
          camOn={camOn}
          sharingScreen={sharingScreen}
          participantCount={participantList.length}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          onToggleScreenShare={toggleScreenShare}
          onLeave={handleLeave}
          onCopyLink={handleCopyLink}
          onToggleParticipants={() => setShowParticipants((v) => !v)}
        />
      </footer>

      {showParticipants && (
        <ParticipantsPanel participants={participantList} onClose={() => setShowParticipants(false)} />
      )}
    </main>
  );
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
