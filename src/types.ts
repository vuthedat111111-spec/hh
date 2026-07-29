export interface UserMediaStatus {
  isAudioMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isNoiseSuppressed: boolean;
}

export interface PeerInfo {
  socketId: string;
  userName: string;
  mediaStatus: UserMediaStatus;
}

export interface ChatMessage {
  id: string;
  senderSocketId: string;
  senderName: string;
  text: string;
  timestamp: string;
  isMe: boolean;
}

export interface RoomInfo {
  roomId: string;
  userName: string;
  isInCall: boolean;
}
