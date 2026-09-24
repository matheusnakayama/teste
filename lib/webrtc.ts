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
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({ type: 'offer', from: this.localId, to: peerId, sdp: offer });
  }

  hangupPeer(peerId: string) {
    const entry = this.peers.get(peerId);
    if (entry) {
      entry.connection.getSenders().forEach((s) => s.track?.stop());
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
  async replaceVideoTrack(track: MediaStreamTrack | null) {
    for (const { connection } of this.peers.values()) {
      const sender = connection.getSenders().find((s) => s.track?.kind === 'video');
      if (sender && track) {
        await sender.replaceTrack(track);
      }
    }
  }

  async replaceAudioTrack(track: MediaStreamTrack | null) {
    for (const { connection } of this.peers.values()) {
      const sender = connection.getSenders().find((s) => s.track?.kind === 'audio');
      if (sender && track) {
        await sender.replaceTrack(track);
      }
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
    this.peers.set(peerId, { connection: pc });

    this.localStream?.getTracks().forEach((track) => {
      pc.addTrack(track, this.localStream!);
    });

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
      const [stream] = event.streams;
      if (stream) {
        this.onTrack(peerId, stream);
        this.watchSpeaking(peerId, stream);
      }
    };

    pc.onconnectionstatechange = () => {
      this.onConnectionStateChange(peerId, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.hangupPeer(peerId);
      }
    };

    return pc;
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

    try {
      if (payload.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.send({ type: 'answer', from: this.localId, to: from, sdp: answer });
      } else if (payload.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      } else if (payload.type === 'ice-candidate') {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    } catch (err) {
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
