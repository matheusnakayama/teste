'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Channel } from 'pusher-js';
import { upload } from '@vercel/blob/client';
import PreJoin from '@/components/PreJoin';
import Controls, { type ScreenShareSettings } from '@/components/Controls';
import ParticipantsGrid from '@/components/ParticipantsGrid';
import ParticipantsPanel from '@/components/ParticipantsPanel';
import ChatPanel from '@/components/ChatPanel';
import ErrorBanner from '@/components/ErrorBanner';
import { subscribeToRoom, disconnectPusher, getPusherClient } from '@/lib/pusherClient';
import { WebRTCManager, type VideoSenderProfile } from '@/lib/webrtc';
import type {
  CallError,
  IceServerConfig,
  Participant,
  RoomChatMessage,
  RoomModerationAction,
  RoomModerationEvent,
} from '@/lib/types';

type Phase = 'pre-join' | 'connecting' | 'in-call' | 'left' | 'kicked' | 'fatal-error';

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
  const [micLockedByHost, setMicLockedByHost] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [screenShareSettings, setScreenShareSettings] = useState<ScreenShareSettings>({ height: 1080, frameRate: 60 });
  const [screenCaptureInfo, setScreenCaptureInfo] = useState('');
  const [muteRemoteAudioDuringShare, setMuteRemoteAudioDuringShare] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [hostId, setHostId] = useState('');
  const [focusedPresentationId, setFocusedPresentationId] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<CallError | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const localIdRef = useRef<string>('');
  const localNameRef = useRef<string>('');
  const roomSessionRef = useRef('');
  const participantNamesRef = useRef(new Map<string, string>());
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenAudioContextRef = useRef<AudioContext | null>(null);
  const presentationSectionRef = useRef<HTMLElement | null>(null);
  const chatOpenRef = useRef(false);
  const hostIdRef = useRef('');
  const memberJoinTimesRef = useRef(new Map<string, number>());
  const micLockedByHostRef = useRef(false);
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
    channelRef.current?.unbind('client-chat-message');
    channelRef.current?.unbind('client-moderation');
    channelRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenAudioContextRef.current?.close().catch(() => {});
    screenAudioContextRef.current = null;
    cameraStreamRef.current = null;
    screenStreamRef.current = null;
    roomSessionRef.current = '';
    localIdRef.current = '';
    disconnectPusher();
  }, []);

  useEffect(() => cleanup, [cleanup]);

  function updateHost(nextHostId: string) {
    hostIdRef.current = nextHostId;
    setHostId(nextHostId);
  }

  function electHostFromPresence() {
    const oldest = Array.from(memberJoinTimesRef.current.entries())
      .sort(([idA, timeA], [idB, timeB]) => timeA - timeB || idA.localeCompare(idB))[0];
    updateHost(oldest?.[0] ?? '');
  }

  useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement) setFocusedPresentationId(null);
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!focusedPresentationId) return;
    const stillSharing = Object.values(participants).some(
      (participant) => participant.id === focusedPresentationId && participant.isSharingScreen
    );
    if (!stillSharing) {
      setFocusedPresentationId(null);
      if (document.fullscreenElement === presentationSectionRef.current) {
        void document.exitFullscreen().catch(() => {});
      }
    }
  }, [focusedPresentationId, participants]);

  async function handleJoin(opts: {
    name: string;
    stream: MediaStream | null;
    camOn: boolean;
    micOn: boolean;
  }) {
    setPhase('connecting');
    setChatMessages([]);
    setChatUnreadCount(0);
    memberJoinTimesRef.current.clear();
    updateHost('');
    micLockedByHostRef.current = false;
    setMicLockedByHost(false);
    setShowChat(false);
    chatOpenRef.current = false;
    localNameRef.current = opts.name;
    cameraStreamRef.current = opts.stream;
    setMicOn(opts.micOn);
    setCamOn(opts.camOn);

    try {
      const sessionResponse = await fetch('/api/pusher/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      const sessionData = await sessionResponse.json() as { userId?: unknown; token?: unknown; error?: unknown };
      if (!sessionResponse.ok || typeof sessionData.userId !== 'string' || typeof sessionData.token !== 'string') {
        throw new Error(typeof sessionData.error === 'string' ? sessionData.error : 'Não foi possível criar a sessão da sala.');
      }
      localIdRef.current = sessionData.userId;
      roomSessionRef.current = sessionData.token;
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

      const iceServers = await fetchIceServers();
      const channel = subscribeToRoom(roomId, opts.name, localIdRef.current, roomSessionRef.current);
      channelRef.current = channel;
      channel.bind('client-chat-message', (payload: unknown, metadata?: unknown) => {
        const senderId = getPusherEventUserId(metadata);
        const message = normalizeChatMessage(payload, senderId, participantNamesRef.current.get(senderId ?? ''));
        if (!message || message.senderId === localIdRef.current) return;
        appendChatMessage(message);
      });
      channel.bind('client-moderation', (payload: unknown, metadata?: unknown) => {
        const moderation = normalizeModerationEvent(payload);
        if (!moderation || getPusherEventUserId(metadata) !== hostIdRef.current) return;

        const targetIsLocal = moderation.targetId === localIdRef.current;
        const actionText = moderation.action === 'kick'
          ? `${moderation.targetName} foi removido da sala.`
          : moderation.action === 'mute'
            ? `${moderation.targetName} foi silenciado pelo anfitrião.`
            : `${moderation.targetName} teve o microfone liberado pelo anfitrião.`;

        if (moderation.action === 'kick' && targetIsLocal) {
          appendSystemChatMessage('Você foi removido da sala pelo anfitrião.');
          cleanup();
          chatOpenRef.current = false;
          setShowChat(false);
          setPhase('kicked');
          return;
        }

        appendSystemChatMessage(actionText);
        if (targetIsLocal && moderation.action === 'mute') void applyHostMicState(true);
        if (targetIsLocal && moderation.action === 'unmute') void applyHostMicState(false);
      });

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
          memberJoinTimesRef.current.set(m.id, Number.isFinite(m.info?.joinedAt) ? m.info.joinedAt : Date.now());
          if (m.id !== localIdRef.current) {
            participantNamesRef.current.set(m.id, m.info?.name || 'Convidado');
            others.push(m);
          }
        });
        electHostFromPresence();

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
          manager.preparePeerConnection(m.id);
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
        memberJoinTimesRef.current.set(
          member.id,
          Number.isFinite(member.info?.joinedAt) ? member.info.joinedAt : Date.now()
        );
        electHostFromPresence();
        setParticipants((prev) => {
          const participant = createRemoteParticipant(member.id, memberName);
          return {
            ...prev,
            [member.id]: { ...participant, ...prev[member.id], name: memberName },
          };
        });
        manager.preparePeerConnection(member.id);
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
        memberJoinTimesRef.current.delete(member.id);
        if (member.id === hostIdRef.current) electHostFromPresence();
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

      const pusher = getPusherClient(opts.name, localIdRef.current, roomId, roomSessionRef.current);
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

  function appendChatMessage(message: RoomChatMessage) {
    setChatMessages((previous) => [...previous.slice(-199), message]);
    if (!chatOpenRef.current) setChatUnreadCount((count) => Math.min(count + 1, 999));
  }

  function appendSystemChatMessage(text: string) {
    appendChatMessage({
      id: createChatMessageId(),
      senderId: 'system',
      senderName: 'Sistema',
      text,
      sentAt: Date.now(),
      isSystem: true,
    });
  }

  function updateLocalParticipant(patch: Partial<Participant>) {
    setParticipants((prev) => {
      const local = prev[localIdRef.current];
      if (!local) return prev;
      return { ...prev, [localIdRef.current]: { ...local, ...patch } };
    });
  }

  async function applyHostMicState(muted: boolean) {
    micLockedByHostRef.current = muted;
    setMicLockedByHost(muted);

    const microphoneTracks = cameraStreamRef.current?.getAudioTracks() ?? [];
    const nextMicOn = !muted && microphoneTracks.length > 0;
    microphoneTracks.forEach((track) => { track.enabled = nextMicOn; });
    currentMicRef.current = nextMicOn;
    setMicOn(nextMicOn);
    updateLocalParticipant({ micOn: nextMicOn });

    const manager = managerRef.current;
    try {
      if (muted) {
        // Silencia toda a faixa enviada, incluindo áudio de tela que estivesse
        // misturado ao microfone, e não só o microfone físico.
        await manager?.replaceAudioTrack(null);
      } else if (currentSharingRef.current && screenStreamRef.current?.getAudioTracks()[0]) {
        await setOutgoingScreenAudio(screenStreamRef.current.getAudioTracks()[0]);
      } else {
        await setOutgoingScreenAudio(null);
      }
    } catch (error) {
      console.error('Não foi possível aplicar o controle do microfone pelo anfitrião:', error);
      setBanner('O estado do microfone mudou, mas não foi possível atualizar o áudio enviado.');
    }

    manager?.broadcastMediaState({ micOn: nextMicOn, camOn: currentCamRef.current });
    if (!muted && !microphoneTracks.length) {
      setBanner('O anfitrião liberou seu microfone, mas não há microfone disponível neste dispositivo.');
    }
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
    if (micLockedByHostRef.current) {
      setBanner('O anfitrião bloqueou seu microfone. Aguarde ele liberar o áudio.');
      return;
    }
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
        video: getScreenVideoConstraints(screenShareSettings),
        audio: { restrictOwnAudio: true },
        // Reexibe a opção de capturar o áudio do sistema ao compartilhar a
        // tela inteira. O navegador pode não oferecer áudio em toda superfície.
        systemAudio: 'include',
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
      const profile = getScreenVideoProfile(screenShareSettings);
      if (profile) {
        screenTrack.contentHint = profile.maxFramerate >= 60 ? 'motion' : 'detail';
        try {
          await screenTrack.applyConstraints(getScreenVideoConstraints(screenShareSettings));
        } catch (constraintError) {
          // O fluxo continua usando a melhor qualidade que o navegador conseguiu capturar.
          console.warn('O navegador não aceitou todos os limites de captura escolhidos:', constraintError);
        }
      }
      const settings = screenTrack.getSettings();
      const actualCaptureInfo = formatScreenCaptureSettings(settings, screenShareSettings);
      const displayAudioTrack = display.getAudioTracks()[0] ?? null;
      const displaySurface = (settings as MediaTrackSettings & { displaySurface?: string }).displaySurface;
      const mayContainCallAudio = displaySurface !== 'browser';
      const audioSettings = displayAudioTrack?.getSettings() as (MediaTrackSettings & { restrictOwnAudio?: boolean }) | undefined;
      const audioConstraints = navigator.mediaDevices.getSupportedConstraints() as MediaTrackSupportedConstraints & { restrictOwnAudio?: boolean };
      const ownCallAudioIsFiltered = audioConstraints.restrictOwnAudio === true && audioSettings?.restrictOwnAudio !== false;
      const useLocalMuteFallback = Boolean(displayAudioTrack && mayContainCallAudio && !ownCallAudioIsFiltered);
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
        await manager.replaceAudioTrack(cameraStreamRef.current?.getAudioTracks()[0] ?? null).catch(() => {});
        setBanner('Para compartilhar áudio, escolha uma tela, guia ou janela e marque “Compartilhar áudio” no seletor do navegador. A opção depende do navegador e do sistema operacional.');
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
    chatOpenRef.current = false;
    setPhase('left');
  }

  function sendChatMessage(text: string, imageUrl?: string): boolean {
    if (!imageUrl && handleModerationCommand(text)) return true;
    const channel = channelRef.current;
    if (!channel || !localIdRef.current) return false;

    const message: RoomChatMessage = {
      id: createChatMessageId(),
      senderId: localIdRef.current,
      senderName: localNameRef.current,
      text: text.trim().slice(0, 500),
      sentAt: Date.now(),
      imageUrl,
    };
    if (!message.text && !message.imageUrl) return false;

    try {
      if (!channel.trigger('client-chat-message', message)) {
        setBanner('Não foi possível enviar a mensagem. Verifique se ainda está conectado à sala.');
        return false;
      }
      appendChatMessage(message);
      return true;
    } catch (error) {
      console.error('Não foi possível enviar a mensagem do chat:', error);
      setBanner('Não foi possível enviar a mensagem. Tente novamente.');
      return false;
    }
  }

  function handleModerationCommand(text: string): boolean {
    if (!/^\.(kick|mute|unmute)\b/i.test(text.trim())) return false;
    if (hostIdRef.current !== localIdRef.current) {
      showCommandFeedback('Só o anfitrião da sala pode usar comandos de moderação.');
      return true;
    }

    const match = /^\.(kick|mute|unmute)\s+@(.+?)\s*$/i.exec(text.trim());
    if (!match) {
      showCommandFeedback('Formato do comando: .kick @nome, .mute @nome ou .unmute @nome.');
      return true;
    }

    const action = match[1].toLowerCase() as RoomModerationAction;
    const requestedName = match[2].trim().toLocaleLowerCase('pt-BR');
    const matches = Object.values(participants).filter(
      (participant) => participant.name.trim().toLocaleLowerCase('pt-BR') === requestedName
    );
    if (matches.length === 0) {
      showCommandFeedback(`Não encontrei “@${match[2].trim()}” na sala. Use o nome que aparece na lista de participantes.`);
      return true;
    }
    if (matches.length > 1) {
      showCommandFeedback('Há mais de uma pessoa com esse nome. Peça para alguém usar um nome diferente antes de moderar.');
      return true;
    }

    const target = matches[0];
    if (target.id === hostIdRef.current) {
      showCommandFeedback('O anfitrião não pode remover ou silenciar a própria conta por comando.');
      return true;
    }

    const channel = channelRef.current;
    if (!channel) {
      showCommandFeedback('A sala ainda está conectando. Tente o comando novamente em instantes.');
      return true;
    }

    const moderation: RoomModerationEvent = { action, targetId: target.id, targetName: target.name };
    try {
      if (!channel.trigger('client-moderation', moderation)) {
        showCommandFeedback('Não foi possível enviar o comando. Verifique se você ainda está conectado à sala.');
        return true;
      }
      const notice = action === 'kick'
        ? `${target.name} foi removido da sala.`
        : action === 'mute'
          ? `${target.name} foi silenciado pelo anfitrião.`
          : `${target.name} teve o microfone liberado pelo anfitrião.`;
      appendSystemChatMessage(notice);
    } catch (error) {
      console.error('Não foi possível executar o comando de moderação:', error);
      showCommandFeedback('Não foi possível enviar o comando de moderação. Tente novamente.');
    }
    return true;
  }

  function showCommandFeedback(message: string) {
    setBanner(message);
    appendSystemChatMessage(message);
  }

  async function sendChatImage(file: File) {
    const extensionByType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const extension = extensionByType[file.type];
    if (!extension) throw new Error('Formato de imagem não aceito.');
    if (!localIdRef.current) throw new Error('Entre na sala antes de enviar uma imagem.');

    const uniqueName = createChatMessageId();
    const blob = await upload(`chat/${roomId}/${uniqueName}.${extension}`, file, {
      access: 'public',
      contentType: file.type,
      handleUploadUrl: '/api/chat-images/upload',
      clientPayload: JSON.stringify({ roomId, userId: localIdRef.current, sessionToken: roomSessionRef.current }),
    });
    if (!sendChatMessage('', blob.url)) {
      throw new Error('A imagem foi carregada, mas não pôde ser enviada para a sala.');
    }
  }

  function toggleChatPanel() {
    const next = !chatOpenRef.current;
    chatOpenRef.current = next;
    setShowChat(next);
    if (next) {
      setChatUnreadCount(0);
      setShowParticipants(false);
    }
  }

  function toggleParticipantsPanel() {
    setShowParticipants((open) => !open);
    setShowChat(false);
    chatOpenRef.current = false;
  }

  function focusPresentation(participantId: string) {
    setFocusedPresentationId(participantId);
    setShowChat(false);
    chatOpenRef.current = false;
    setShowParticipants(false);
    const section = presentationSectionRef.current;
    if (section && !document.fullscreenElement && section.requestFullscreen) {
      void section.requestFullscreen().catch(() => {
        // O layout fixo ainda amplia a apresentação quando a API não está liberada.
      });
    }
  }

  function exitPresentationFocus() {
    setFocusedPresentationId(null);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }

  function handleCopyLink() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(inviteLink).catch(() => {});
    }
  }

  const participantList = Object.values(participants);
  const isHost = Boolean(localIdRef.current) && hostId === localIdRef.current;

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
            className="rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 transition hover:brightness-110 px-5 py-3 font-semibold text-white"
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

  if (phase === 'kicked') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 gap-5 text-center">
        <h1 className="text-2xl font-bold">Você foi removido da sala</h1>
        <p className="max-w-sm text-white/60">O anfitrião encerrou sua participação nesta chamada.</p>
        <a href="/" className="rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 px-5 py-3 font-semibold text-white transition hover:brightness-110">
          Página inicial
        </a>
      </main>
    );
  }

  const isConnecting = phase === 'connecting';

  return (
    <main className="min-h-screen flex flex-col bg-transparent">
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

      <section
        ref={presentationSectionRef}
        className={focusedPresentationId
          ? 'fixed inset-0 z-50 h-screen w-screen overflow-hidden bg-black p-0'
          : 'flex-1 overflow-hidden px-3 py-4 sm:px-6'}
      >
        {isConnecting ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-white/60 animate-fadeIn">Conectando à sala…</p>
          </div>
        ) : participantList.length <= 1 && !focusedPresentationId ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
            <div className="max-w-xs">
              <ParticipantsGrid
                participants={participantList}
                muteRemoteAudio={muteRemoteAudioDuringShare}
                focusedParticipantId={focusedPresentationId}
                onFocusPresentation={focusPresentation}
                onExitPresentationFocus={exitPresentationFocus}
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
            focusedParticipantId={focusedPresentationId}
            onFocusPresentation={focusPresentation}
            onExitPresentationFocus={exitPresentationFocus}
          />
        )}
      </section>

      <footer className="px-3 sm:px-6 py-4 border-t border-surface-border">
        <Controls
          micOn={micOn}
          camOn={camOn}
          sharingScreen={sharingScreen}
          screenShareSettings={screenShareSettings}
          onScreenShareSettingsChange={setScreenShareSettings}
          participantCount={participantList.length}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          onToggleScreenShare={toggleScreenShare}
          onLeave={handleLeave}
          onCopyLink={handleCopyLink}
          onToggleParticipants={toggleParticipantsPanel}
          onToggleChat={toggleChatPanel}
          chatUnreadCount={chatUnreadCount}
          isHost={isHost}
          micLockedByHost={micLockedByHost}
        />
        {sharingScreen && screenCaptureInfo && (
          <p className="mt-2 text-center text-xs text-white/55">
            Captura: {screenCaptureInfo}. O envio ajusta a banda para acompanhar sua conexão e manter a apresentação estável.
          </p>
        )}
      </footer>

      {showParticipants && (
        <ParticipantsPanel participants={participantList} onClose={() => setShowParticipants(false)} />
      )}
      {showChat && (
        <ChatPanel
          messages={chatMessages}
          currentUserId={localIdRef.current}
          isHost={isHost}
          hostName={participants[hostId]?.name ?? ''}
          onClose={toggleChatPanel}
          onSend={sendChatMessage}
          onSendImage={sendChatImage}
        />
      )}
    </main>
  );
}

function getScreenVideoConstraints(settings: ScreenShareSettings): MediaTrackConstraints {
  const width = Math.round(settings.height * 16 / 9);
  return {
    width: { ideal: width, max: width },
    height: { ideal: settings.height, max: settings.height },
    frameRate: { ideal: settings.frameRate, max: settings.frameRate },
  };
}

function getScreenVideoProfile(settings: ScreenShareSettings): VideoSenderProfile & { width: number; height: number } {
  const width = Math.round(settings.height * 16 / 9);
  const pixelRate = width * settings.height * settings.frameRate;
  const referencePixelRate = 1920 * 1080 * 60;
  // Limite agregado para a malha P2P. Cada nova pessoa divide essa banda; um
  // navegador ou conexão mais fracos ainda podem entregar menos que o pedido.
  const totalBitrate = Math.min(24_000_000, Math.max(1_000_000, Math.round(pixelRate / referencePixelRate * 6_000_000)));
  return {
    width,
    height: settings.height,
    maxFramerate: settings.frameRate,
    maxBitrate: totalBitrate,
    totalBitrate,
  };
}

function formatScreenCaptureSettings(settings: MediaTrackSettings, requested: ScreenShareSettings) {
  const profile = getScreenVideoProfile(requested);
  const dimensions = settings.width && settings.height
    ? `${settings.width} × ${settings.height}`
    : `${profile.width} × ${profile.height} (solicitado)`;
  const frameRate = settings.frameRate ? `${Math.round(settings.frameRate)} fps` : `${profile.maxFramerate} fps (solicitado)`;
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

function getPusherEventUserId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const userId = (metadata as { user_id?: unknown }).user_id;
  return typeof userId === 'string' && userId.length <= 100 ? userId : null;
}

function createChatMessageId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function normalizeChatMessage(
  payload: unknown,
  trustedSenderId: string | null,
  trustedSenderName?: string
): RoomChatMessage | null {
  if (!payload || typeof payload !== 'object' || !trustedSenderId) return null;
  const candidate = payload as Partial<RoomChatMessage>;
  const text = typeof candidate.text === 'string' ? candidate.text.trim().slice(0, 500) : '';
  let imageUrl: string | undefined;
  if (typeof candidate.imageUrl === 'string') {
    try {
      const parsed = new URL(candidate.imageUrl);
      if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.blob.vercel-storage.com')) {
        imageUrl = parsed.toString();
      }
    } catch {
      // Ignora endereços que não são URLs válidas.
    }
  }
  if (!text && !imageUrl) return null;

  const sentAt = typeof candidate.sentAt === 'number' && Number.isFinite(candidate.sentAt)
      && Math.abs(candidate.sentAt) <= 8_640_000_000_000_000
    ? candidate.sentAt
    : Date.now();

  return {
    id: typeof candidate.id === 'string' ? candidate.id.slice(0, 100) : `${trustedSenderId}-${sentAt}`,
    senderId: trustedSenderId,
    senderName: trustedSenderName?.trim().slice(0, 40) || 'Convidado',
    text,
    sentAt,
    imageUrl,
    isSystem: false,
  };
}

function normalizeModerationEvent(payload: unknown): RoomModerationEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Partial<RoomModerationEvent>;
  if (
    candidate.action !== 'kick' && candidate.action !== 'mute' && candidate.action !== 'unmute'
  ) return null;
  if (typeof candidate.targetId !== 'string' || candidate.targetId.length > 100) return null;
  return {
    action: candidate.action,
    targetId: candidate.targetId,
    targetName: typeof candidate.targetName === 'string' ? candidate.targetName.trim().slice(0, 40) || 'Participante' : 'Participante',
  };
}
