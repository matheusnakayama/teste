'use client';

import type { Channel } from 'pusher-js';
import type { IceServerConfig, SignalPayload } from './types';

type TrackHandler = (peerId: string, stream: MediaStream) => void;
type ConnectionStateHandler = (peerId: string, state: RTCPeerConnectionState) => void;
type SpeakingHandler = (peerId: string, speaking: boolean) => void;
type ScreenShareHandler = (peerId: string, sharing: boolean) => void;
type MediaStateHandler = (peerId: string, state: { micOn: boolean; camOn: boolean }) => void;

interface PeerEntry {
  connection: RTCPeerConnection;
  remoteStream?: MediaStream;
  makingOffer: boolean;
  initialOfferStarted: boolean;
  negotiationQueued: boolean;
  polite: boolean;
  settingRemoteAnswerPending: boolean;
  ignoreOffer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  retryNegotiation?: () => void;
}

interface SpeakingWatcher {
  ctx: AudioContext;
  analyser: AnalyserNode;
  raf: number;
}

/**
 * Gerencia uma topologia "mesh": cada participante mantém uma RTCPeerConnection
 * direta com todos os demais. Funciona bem para salas pequenas (até ~6-8
 * pessoas). A sinalização (offer/answer/ICE) trafega pelo canal de presença
 * do Pusher usando eventos "client-*".
 */
export class WebRTCManager {
  private peers = new Map<string, PeerEntry>();
  private speakingWatchers = new Map<string, SpeakingWatcher>();
  private localStream: MediaStream | null = null;
  private hasAudioTrackOverride = false;
  private audioTrackOverride: MediaStreamTrack | null = null;
  private hasVideoTrackOverride = false;
  private videoTrackOverride: MediaStreamTrack | null = null;
  private videoReplaceChain: Promise<void> = Promise.resolve();
  private iceServers: IceServerConfig[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  private channel: Channel;
  private localId: string;

  onTrack: TrackHandler = () => {};
  onConnectionStateChange: ConnectionStateHandler = () => {};
  onSpeakingChange: SpeakingHandler = () => {};
  onScreenShareState: ScreenShareHandler = () => {};
  onMediaState: MediaStateHandler = () => {};

  constructor(channel: Channel, localId: string) {
    this.channel = channel;
    this.localId = localId;
    this.channel.bind('client-signal', (payload: SignalPayload) => {
      if ('to' in payload && payload.to !== this.localId) return;
      this.handleSignal(payload);
    });
  }

  setIceServers(servers: IceServerConfig[]) {
    if (servers.length) this.iceServers = servers;
  }

  setLocalStream(stream: MediaStream) {
    this.localStream = stream;
    this.watchSpeaking(this.localId, stream);
  }

  /** Cria uma nova conexão e envia uma oferta (usado quando ALGUÉM ENTRA depois de mim, ou quando EU acabei de entrar e preciso chamar quem já está lá). */
  async callPeer(peerId: string) {
    const pc = this.ensurePeerConnection(peerId);
    const peer = this.peers.get(peerId);
    if (!peer) return;
    // Apenas um offer inicial por par: se a outra ponta já iniciou a conexão,
    // não crie uma segunda oferta concorrente.
    if (peer.initialOfferStarted || peer.makingOffer || pc.signalingState !== 'stable' || pc.remoteDescription) return;
    peer.initialOfferStarted = true;
    peer.makingOffer = true;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.send({ type: 'offer', from: this.localId, to: peerId, sdp: pc.localDescription ?? offer });
    } catch (error) {
      peer.initialOfferStarted = false;
      throw error;
    } finally {
      peer.makingOffer = false;
      if (peer.negotiationQueued) this.requestRenegotiation(peerId, peer);
    }
  }

  hangupPeer(peerId: string) {
    const entry = this.peers.get(peerId);
    if (entry) {
      if (entry.retryNegotiation) {
        entry.connection.removeEventListener('signalingstatechange', entry.retryNegotiation);
        entry.connection.removeEventListener('connectionstatechange', entry.retryNegotiation);
      }
      // As faixas locais são compartilhadas entre todas as conexões da sala.
      // Fechar uma conexão não pode encerrar o microfone/câmera dos demais pares.
      entry.connection.close();
      this.peers.delete(peerId);
    }
    const watcher = this.speakingWatchers.get(peerId);
    if (watcher) {
      cancelAnimationFrame(watcher.raf);
      watcher.ctx.close().catch(() => {});
      this.speakingWatchers.delete(peerId);
    }
  }

  hangupAll() {
    Array.from(this.peers.keys()).forEach((id) => this.hangupPeer(id));
  }

  /** Substitui a faixa de vídeo em todas as conexões (usado para câmera <-> compartilhamento de tela). */
  replaceVideoTrack(track: MediaStreamTrack | null, _stream?: MediaStream | null) {
    // Trocas rápidas (parar/iniciar a apresentação) precisam chegar aos pares
    // na mesma ordem. Manter o mesmo sender evita renegociações desnecessárias,
    // que eram a causa de a imagem funcionar só em algumas guias.
    const update = this.videoReplaceChain.then(async () => {
      this.hasVideoTrackOverride = true;
      this.videoTrackOverride = track;

      for (const { connection } of this.peers.values()) {
        if (connection.signalingState === 'closed') continue;
        let sender = connection.getSenders().find((s) => s.track?.kind === 'video');
        sender ??= connection.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender;
        if (!sender) sender = connection.addTransceiver('video', { direction: 'sendrecv' }).sender;
        await sender.replaceTrack(track);
      }
    });
    this.videoReplaceChain = update.catch(() => {});
    return update;
  }

  async replaceAudioTrack(track: MediaStreamTrack | null) {
    this.hasAudioTrackOverride = true;
    this.audioTrackOverride = track;

    for (const { connection } of this.peers.values()) {
      let sender = connection.getSenders().find((s) => s.track?.kind === 'audio');
      sender ??= connection.getTransceivers().find((t) => t.receiver.track.kind === 'audio')?.sender;
      if (!sender) sender = connection.addTransceiver('audio', { direction: 'sendrecv' }).sender;
      await sender.replaceTrack(track);
    }
  }

  broadcastScreenShareState(sharing: boolean) {
    this.send({ type: 'screen-share-state', from: this.localId, sharing });
  }

  broadcastMediaState(state: { micOn: boolean; camOn: boolean }) {
    this.send({ type: 'media-state', from: this.localId, ...state });
  }

  private ensurePeerConnection(peerId: string): RTCPeerConnection {
    const existing = this.peers.get(peerId);
    if (existing) return existing.connection;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer: PeerEntry = {
      connection: pc,
      makingOffer: false,
      initialOfferStarted: false,
      negotiationQueued: false,
      polite: this.localId > peerId,
      settingRemoteAnswerPending: false,
      ignoreOffer: false,
      pendingCandidates: [],
    };
    this.peers.set(peerId, peer);

    const localTracks = this.localStream?.getTracks() ?? [];
    const localAudioTrack = localTracks.find((track) => track.kind === 'audio') ?? null;
    const localVideoTrack = localTracks.find((track) => track.kind === 'video') ?? null;
    const audioTrack = this.hasAudioTrackOverride ? this.audioTrackOverride : localAudioTrack;
    const videoTrack = this.hasVideoTrackOverride ? this.videoTrackOverride : localVideoTrack;
    const outgoingTracks: MediaStreamTrack[] = [];
    if (audioTrack) outgoingTracks.push(audioTrack);
    if (videoTrack) outgoingTracks.push(videoTrack);

    // Use uma única MediaStream para áudio e vídeo remotos, mesmo quando a
    // imagem enviada é a tela em vez da câmera.
    const outgoingStream = new MediaStream(outgoingTracks);
    outgoingTracks.forEach((track) => pc.addTrack(track, outgoingStream));
    if (!audioTrack) {
      // Mantém o canal de áudio negociado mesmo quando o microfone não estava
      // disponível ao entrar; ele ainda poderá ser substituído depois.
      pc.addTransceiver('audio', { direction: 'sendrecv' });
    }
    if (!videoTrack) {
      // Mantém uma seção de vídeo negociada para quem compartilhar tela sem
      // câmera ou começar o compartilhamento antes de a conexão estar pronta.
      pc.addTransceiver('video', { direction: 'sendrecv' });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({
          type: 'ice-candidate',
          from: this.localId,
          to: peerId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      // Mantenha uma MediaStream estável por participante. Além de cobrir
      // transceivers streamless, isso evita perder a imagem quando o navegador
      // muda a associação da faixa entre câmera e tela durante renegociação.
      const stream = peer.remoteStream ?? new MediaStream();
      const previousTrack = stream.getTracks().find(
        (track) => track.kind === event.track.kind && track.id !== event.track.id
      );
      if (previousTrack) stream.removeTrack(previousTrack);
      if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
      peer.remoteStream = stream;
      this.onTrack(peerId, stream);
      this.watchSpeaking(peerId, stream);
    };

    pc.onconnectionstatechange = () => {
      this.onConnectionStateChange(peerId, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.hangupPeer(peerId);
      }
    };

    return pc;
  }

  private requestRenegotiation(peerId: string, peer: PeerEntry) {
    const pc = peer.connection;
    peer.negotiationQueued = true;

    if (peer.makingOffer) return;
    if (pc.signalingState !== 'stable' || pc.connectionState !== 'connected') {
      if (!peer.retryNegotiation) {
        peer.retryNegotiation = () => {
          if (pc.signalingState === 'stable' && pc.connectionState === 'connected') {
            pc.removeEventListener('signalingstatechange', peer.retryNegotiation!);
            pc.removeEventListener('connectionstatechange', peer.retryNegotiation!);
            peer.retryNegotiation = undefined;
            this.requestRenegotiation(peerId, peer);
          } else if (pc.signalingState === 'closed' || pc.connectionState === 'failed') {
            pc.removeEventListener('signalingstatechange', peer.retryNegotiation!);
            pc.removeEventListener('connectionstatechange', peer.retryNegotiation!);
            peer.retryNegotiation = undefined;
          }
        };
        pc.addEventListener('signalingstatechange', peer.retryNegotiation);
        pc.addEventListener('connectionstatechange', peer.retryNegotiation);
      }
      return;
    }

    peer.negotiationQueued = false;
    peer.makingOffer = true;
    void (async () => {
      try {
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') {
          peer.negotiationQueued = true;
          return;
        }
        await pc.setLocalDescription(offer);
        this.send({
          type: 'offer',
          from: this.localId,
          to: peerId,
          sdp: pc.localDescription ?? offer,
        });
      } catch (err) {
        peer.negotiationQueued = false;
        console.warn('Não foi possível renegociar a faixa de vídeo:', err);
      } finally {
        peer.makingOffer = false;
        if (peer.negotiationQueued) this.requestRenegotiation(peerId, peer);
      }
    })();
  }

  private async flushPendingCandidates(peer: PeerEntry) {
    const pending = peer.pendingCandidates.splice(0);
    for (const candidate of pending) {
      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Candidato ICE ignorado:', err);
      }
    }
  }

  private async handleSignal(payload: SignalPayload) {
    if (payload.type === 'screen-share-state') {
      this.onScreenShareState(payload.from, payload.sharing);
      return;
    }
    if (payload.type === 'media-state') {
      this.onMediaState(payload.from, { micOn: payload.micOn, camOn: payload.camOn });
      return;
    }

    const { from } = payload;
    const pc = this.ensurePeerConnection(from);
    const peer = this.peers.get(from);
    if (!peer) return;

    try {
      if (payload.type === 'offer') {
        const readyForOffer = !peer.makingOffer &&
          (pc.signalingState === 'stable' || peer.settingRemoteAnswerPending);
        const offerCollision = !readyForOffer;
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;
        if (offerCollision) await pc.setLocalDescription({ type: 'rollback' });
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        await this.flushPendingCandidates(peer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        peer.negotiationQueued = false;
        this.send({ type: 'answer', from: this.localId, to: from, sdp: pc.localDescription ?? answer });
      } else if (payload.type === 'answer') {
        peer.settingRemoteAnswerPending = true;
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        peer.settingRemoteAnswerPending = false;
        await this.flushPendingCandidates(peer);
      } else if (payload.type === 'ice-candidate') {
        if (!peer.ignoreOffer) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } else {
            peer.pendingCandidates.push(payload.candidate);
          }
        }
      }
    } catch (err) {
      peer.settingRemoteAnswerPending = false;
      // Falhas pontuais de sinalização (ex.: candidato ICE fora de ordem) não devem
      // derrubar a chamada inteira; o navegador tenta se recuperar sozinho.
      console.warn('Erro ao processar sinal WebRTC:', err);
    }
  }

  private send(payload: SignalPayload) {
    this.channel.trigger('client-signal', payload);
  }

  private watchSpeaking(id: string, stream: MediaStream) {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;
    this.speakingWatchers.get(id)?.ctx.close().catch(() => {});
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      let speaking = false;
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const nowSpeaking = avg > 12;
        if (nowSpeaking !== speaking) {
          speaking = nowSpeaking;
          this.onSpeakingChange(id, speaking);
        }
        raf = requestAnimationFrame(tick);
      };
      let raf = requestAnimationFrame(tick);
      this.speakingWatchers.set(id, { ctx, analyser, raf });
    } catch {
      // API de áudio indisponível; indicador de "falando" simplesmente não aparecerá.
    }
  }

  destroy() {
    this.hangupAll();
    this.speakingWatchers.forEach((w) => {
      cancelAnimationFrame(w.raf);
      w.ctx.close().catch(() => {});
    });
    this.speakingWatchers.clear();
  }
}
