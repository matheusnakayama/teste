export type SignalPayload =
  | { type: 'offer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: 'screen-share-state'; from: string; sharing: boolean }
  | { type: 'media-state'; from: string; micOn: boolean; camOn: boolean };

export interface PresenceMemberInfo {
  name: string;
  joinedAt: number;
}

export interface Participant {
  id: string; // pusher connection/member id
  name: string;
  stream?: MediaStream;
  micOn: boolean;
  camOn: boolean;
  isSpeaking: boolean;
  isSharingScreen: boolean;
  isLocal: boolean;
  connectionState?: RTCPeerConnectionState;
}

export interface RoomChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
  imageUrl?: string;
  isSystem?: boolean;
}

export type RoomModerationAction = 'kick' | 'mute' | 'unmute' | 'promote';

export interface RoomModerationEvent {
  action: RoomModerationAction;
  targetId: string;
  targetName: string;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type CallErrorKind =
  | 'permission-denied'
  | 'device-not-found'
  | 'connection-unstable'
  | 'join-failed'
  | 'room-full'
  | 'unknown';

export interface CallError {
  kind: CallErrorKind;
  message: string;
}
