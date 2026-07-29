import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ChatMessage, PeerInfo, UserMediaStatus } from './types';
import { AudioNoiseProcessor } from './utils/noiseFilter';
import { JoinRoomForm } from './components/JoinRoomForm';
import { CallHeader } from './components/CallHeader';
import { VideoPlayer } from './components/VideoPlayer';
import { ControlBar } from './components/ControlBar';
import { ChatPanel } from './components/ChatPanel';
import { UserCheck, Clock, Share2 } from 'lucide-react';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelay',
      credential: 'openrelay',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelay',
      credential: 'openrelay',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelay',
      credential: 'openrelay',
    },
  ],
};

export default function App() {
  const [isInCall, setIsInCall] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Streams State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remotePeer, setRemotePeer] = useState<PeerInfo | null>(null);

  // Local Controls State
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isNoiseSuppressed, setIsNoiseSuppressed] = useState(false);

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Refs
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const noiseProcessorRef = useRef<AudioNoiseProcessor>(new AudioNoiseProcessor());
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);

  // Default room ID from URL search param
  const [urlRoomId, setUrlRoomId] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setUrlRoomId(roomParam.trim());
    }
  }, []);

  // Initialize Socket connection
  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to signaling server with socket ID:', socket.id);
    });

    socket.on('room-full', ({ message }: { message: string }) => {
      setErrorMessage(message);
      handleLeaveCall();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // WebRTC PeerConnection Helper
  const createPeerConnection = useCallback((targetSocketId: string) => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    videoSenderRef.current = null;

    // Send local tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, localStream);
        if (track.kind === 'video') {
          videoSenderRef.current = sender;
        }
      });
    }

    // ICE Candidate
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', {
          targetSocketId,
          candidate: event.candidate,
        });
      }
    };

    // Remote Stream Track Received
    pc.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind, event.track.id);

      event.track.onunmute = () => {
        console.log('Remote track unmuted:', event.track.kind);
        setRemoteStream((prev) => (prev ? new MediaStream([...prev.getTracks()]) : new MediaStream([event.track])));
      };

      setRemoteStream((prev) => {
        if (!prev) {
          return event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
        }
        const existing = prev.getTracks();
        if (!existing.some((t) => t.id === event.track.id)) {
          return new MediaStream([...existing, event.track]);
        }
        return new MediaStream([...existing]);
      });
    };

    pc.onconnectionstatechange = () => {
      console.log('WebRTC Connection State:', pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setRemoteStream(null);
      }
    };

    return pc;
  }, [localStream]);

  // Handle Socket Events inside Call
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    // Triggered when joining room - contains list of existing users
    const handleRoomJoined = async ({
      yourSocketId,
      usersInRoom,
    }: {
      yourSocketId: string;
      usersInRoom: Array<{ socketId: string; userName: string; isAudioEnabled: boolean; isVideoEnabled: boolean; isScreenSharing: boolean; isNoiseSuppressed: boolean }>;
    }) => {
      console.log('Room joined successfully. Your ID:', yourSocketId, 'Users in room:', usersInRoom);

      if (usersInRoom.length > 0) {
        const peer = usersInRoom[0]; // 1-on-1 call: taking the single other participant
        setRemotePeer({
          socketId: peer.socketId,
          userName: peer.userName,
          mediaStatus: {
            isAudioMuted: !peer.isAudioEnabled,
            isVideoOff: !peer.isVideoEnabled,
            isScreenSharing: peer.isScreenSharing,
            isNoiseSuppressed: peer.isNoiseSuppressed,
          },
        });
      }
    };

    // Triggered when a remote user joins after you
    const handleUserJoined = async ({
      user,
    }: {
      user: { socketId: string; userName: string; isAudioEnabled: boolean; isVideoEnabled: boolean; isScreenSharing: boolean; isNoiseSuppressed: boolean };
    }) => {
      console.log('New peer joined:', user);
      setRemotePeer({
        socketId: user.socketId,
        userName: user.userName,
        mediaStatus: {
          isAudioMuted: !user.isAudioEnabled,
          isVideoOff: !user.isVideoEnabled,
          isScreenSharing: user.isScreenSharing,
          isNoiseSuppressed: user.isNoiseSuppressed,
        },
      });

      // Caller creates Offer
      const pc = createPeerConnection(user.socketId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', {
          targetSocketId: user.socketId,
          sdp: offer,
        });
      } catch (err) {
        console.error('Error creating offer:', err);
      }
    };

    // Handle incoming Offer
    const handleOffer = async ({
      senderSocketId,
      sdp,
    }: {
      senderSocketId: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      console.log('Received offer from:', senderSocketId);
      let pc = pcRef.current;
      if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
        pc = createPeerConnection(senderSocketId);
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', {
          targetSocketId: senderSocketId,
          sdp: answer,
        });
      } catch (err) {
        console.error('Error handling offer, recreating connection:', err);
        const freshPc = createPeerConnection(senderSocketId);
        await freshPc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await freshPc.createAnswer();
        await freshPc.setLocalDescription(answer);
        socket.emit('answer', {
          targetSocketId: senderSocketId,
          sdp: answer,
        });
      }
    };

    // Handle incoming Answer
    const handleAnswer = async ({
      sdp,
    }: {
      senderSocketId: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      console.log('Received answer');
      if (pcRef.current) {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (err) {
          console.error('Error setting remote description from answer:', err);
        }
      }
    };

    // Handle incoming ICE Candidate
    const handleIceCandidate = async ({
      candidate,
    }: {
      senderSocketId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      if (pcRef.current && candidate) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    };

    // Handle Peer Media Status Changes
    const handlePeerMediaToggled = ({
      type,
      enabled,
    }: {
      socketId: string;
      type: 'audio' | 'video' | 'screen' | 'noiseSuppression';
      enabled: boolean;
    }) => {
      setRemotePeer((prev) => {
        if (!prev) return null;
        const newStatus: UserMediaStatus = { ...prev.mediaStatus };
        if (type === 'audio') newStatus.isAudioMuted = !enabled;
        if (type === 'video') {
          newStatus.isVideoOff = !enabled;
          if (enabled) {
            setRemoteStream((prevStream) => (prevStream ? new MediaStream([...prevStream.getTracks()]) : null));
          }
        }
        if (type === 'screen') newStatus.isScreenSharing = enabled;
        if (type === 'noiseSuppression') newStatus.isNoiseSuppressed = enabled;
        return { ...prev, mediaStatus: newStatus };
      });
    };

    // Handle Chat Messages
    const handleReceiveMessage = (msg: {
      id: string;
      senderSocketId: string;
      senderName: string;
      text: string;
      timestamp: string;
    }) => {
      const isMe = msg.senderSocketId === socket.id;
      const chatMsg: ChatMessage = {
        id: msg.id,
        senderSocketId: msg.senderSocketId,
        senderName: msg.senderName,
        text: msg.text,
        timestamp: msg.timestamp,
        isMe,
      };

      setMessages((prev) => [...prev, chatMsg]);
      if (!isMe && !isChatOpen) {
        setUnreadCount((prev) => prev + 1);
      }
    };

    // Handle User Leaving
    const handleUserLeft = ({ userName }: { socketId: string; userName: string }) => {
      console.log('Remote user left:', userName);
      setRemotePeer(null);
      setRemoteStream(null);
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };

    socket.on('room-joined', handleRoomJoined);
    socket.on('user-joined', handleUserJoined);
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('peer-media-toggled', handlePeerMediaToggled);
    socket.on('receive-message', handleReceiveMessage);
    socket.on('user-left', handleUserLeft);

    return () => {
      socket.off('room-joined', handleRoomJoined);
      socket.off('user-joined', handleUserJoined);
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('peer-media-toggled', handlePeerMediaToggled);
      socket.off('receive-message', handleReceiveMessage);
      socket.off('user-left', handleUserLeft);
    };
  }, [createPeerConnection, isChatOpen]);

  // Join Call Logic
  const handleJoinRoom = async (
    targetRoomId: string,
    targetUserName: string,
    initialAudioMuted: boolean = false,
    initialVideoOff: boolean = false
  ) => {
    setErrorMessage(null);

    try {
      // Get User Media Stream with 1080p high quality constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack && initialAudioMuted) {
        audioTrack.enabled = false;
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && initialVideoOff) {
        videoTrack.stop(); // Turn off camera hardware completely
        cameraTrackRef.current = null;
        setLocalStream(new MediaStream(audioTrack ? [audioTrack] : []));
      } else {
        setLocalStream(stream);
        cameraTrackRef.current = videoTrack || null;
      }

      setIsAudioMuted(initialAudioMuted);
      setIsVideoOff(initialVideoOff);

      setRoomId(targetRoomId);
      setUserName(targetUserName);
      setIsInCall(true);

      // Notify socket server
      if (socketRef.current) {
        socketRef.current.emit('join-room', {
          roomId: targetRoomId,
          userName: targetUserName,
        });

        if (initialAudioMuted) {
          socketRef.current.emit('toggle-media', {
            roomId: targetRoomId,
            type: 'audio',
            enabled: false,
          });
        }

        if (initialVideoOff) {
          socketRef.current.emit('toggle-media', {
            roomId: targetRoomId,
            type: 'video',
            enabled: false,
          });
        }
      }
    } catch (err) {
      console.error('Camera/Microphone access error:', err);
      setErrorMessage('Không thể truy cập Camera hoặc Microphone. Vui lòng cấp quyền trong trình duyệt.');
    }
  };

  // Leave Call Logic
  const handleLeaveCall = () => {
    if (socketRef.current && roomId) {
      socketRef.current.emit('leave-room');
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    videoSenderRef.current = null;

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    noiseProcessorRef.current.cleanup();

    setRemoteStream(null);
    setRemotePeer(null);
    setIsInCall(false);
    setIsAudioMuted(false);
    setIsVideoOff(false);
    setIsScreenSharing(false);
    setIsNoiseSuppressed(false);
    setMessages([]);
    setUnreadCount(0);
  };

  // Toggle Mic Audio
  const handleToggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const newMutedState = !audioTrack.enabled;
        setIsAudioMuted(newMutedState);

        if (socketRef.current && roomId) {
          socketRef.current.emit('toggle-media', {
            roomId,
            type: 'audio',
            enabled: !newMutedState,
          });
        }
      }
    }
  };

  // Toggle Camera Video (Fully releases camera hardware when OFF, re-acquires HD stream when ON)
  const handleToggleVideo = async () => {
    if (isVideoOff) {
      // Re-enable Camera
      try {
        const freshVideoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
        });
        const newVideoTrack = freshVideoStream.getVideoTracks()[0];

        if (newVideoTrack) {
          cameraTrackRef.current = newVideoTrack;

          // Replace track on existing WebRTC video sender
          if (videoSenderRef.current) {
            await videoSenderRef.current.replaceTrack(newVideoTrack);
          } else if (pcRef.current) {
            videoSenderRef.current = pcRef.current.addTrack(newVideoTrack, localStream || freshVideoStream);
          }

          // Update local stream
          const audioTracks = localStream ? localStream.getAudioTracks() : [];
          const updatedStream = new MediaStream([newVideoTrack, ...audioTracks]);
          setLocalStream(updatedStream);
          setIsVideoOff(false);

          if (socketRef.current && roomId) {
            socketRef.current.emit('toggle-media', {
              roomId,
              type: 'video',
              enabled: true,
            });
          }
        }
      } catch (err) {
        console.error('Không thể bật lại camera:', err);
      }
    } else {
      // Turn Camera OFF and STOP hardware track (turns off hardware camera LED light!)
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0] || cameraTrackRef.current;
        if (videoTrack) {
          videoTrack.stop();
        }
      }

      if (cameraTrackRef.current) {
        cameraTrackRef.current.stop();
        cameraTrackRef.current = null;
      }

      // Detach track from WebRTC video sender without destroying sender reference
      if (videoSenderRef.current) {
        await videoSenderRef.current.replaceTrack(null);
      } else if (pcRef.current) {
        const senders = pcRef.current.getSenders();
        const vSender = senders.find((s) => s.track?.kind === 'video');
        if (vSender) {
          videoSenderRef.current = vSender;
          await vSender.replaceTrack(null);
        }
      }

      // Update local stream state without video
      if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        setLocalStream(new MediaStream([...audioTracks]));
      }

      setIsVideoOff(true);

      if (socketRef.current && roomId) {
        socketRef.current.emit('toggle-media', {
          roomId,
          type: 'video',
          enabled: false,
        });
      }
    }
  };

  // Toggle Screen Share (Full HD 1080p 25fps)
  const handleToggleScreenShare = async () => {
    if (!isInCall || !localStream) return;

    if (!isScreenSharing) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 },
            frameRate: { ideal: 25, max: 25 },
          },
          audio: true,
        });

        const screenVideoTrack = displayStream.getVideoTracks()[0];
        screenTrackRef.current = screenVideoTrack;

        // Replace video sender track in RTCPeerConnection
        if (videoSenderRef.current) {
          await videoSenderRef.current.replaceTrack(screenVideoTrack);
        } else if (pcRef.current) {
          videoSenderRef.current = pcRef.current.addTrack(screenVideoTrack, localStream);
        }

        // Update local stream state with screen track for local display
        const newLocalStream = new MediaStream([screenVideoTrack, ...localStream.getAudioTracks()]);
        setLocalStream(newLocalStream);
        setIsScreenSharing(true);

        if (socketRef.current && roomId) {
          socketRef.current.emit('toggle-media', { roomId, type: 'screen', enabled: true });
        }

        // Handle when user stops sharing via browser bar button
        screenVideoTrack.onended = () => {
          revertFromScreenShare();
        };
      } catch (err) {
        console.warn('Screen share canceled or failed:', err);
      }
    } else {
      revertFromScreenShare();
    }
  };

  const revertFromScreenShare = async () => {
    if (videoSenderRef.current) {
      await videoSenderRef.current.replaceTrack(cameraTrackRef.current || null);
    }

    if (cameraTrackRef.current && localStream) {
      const newLocalStream = new MediaStream([cameraTrackRef.current, ...localStream.getAudioTracks()]);
      setLocalStream(newLocalStream);
    } else if (localStream) {
      setLocalStream(new MediaStream([...localStream.getAudioTracks()]));
    }

    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    setIsScreenSharing(false);

    if (socketRef.current && roomId) {
      socketRef.current.emit('toggle-media', { roomId, type: 'screen', enabled: false });
    }
  };

  // Toggle Noise Filter (Web Audio API)
  const handleToggleNoiseFilter = () => {
    if (!localStream) return;

    const nextState = !isNoiseSuppressed;
    setIsNoiseSuppressed(nextState);

    const processedStream = noiseProcessorRef.current.processAudioStream(localStream, nextState);
    const newAudioTrack = processedStream.getAudioTracks()[0];

    // Replace audio track in RTCPeerConnection if active
    if (pcRef.current && newAudioTrack) {
      const senders = pcRef.current.getSenders();
      const audioSender = senders.find((s) => s.track && s.track.kind === 'audio');
      if (audioSender) {
        audioSender.replaceTrack(newAudioTrack);
      }
    }

    if (socketRef.current && roomId) {
      socketRef.current.emit('toggle-media', {
        roomId,
        type: 'noiseSuppression',
        enabled: nextState,
      });
    }
  };

  // Send Chat Message
  const handleSendMessage = (text: string) => {
    if (socketRef.current && roomId && text.trim()) {
      socketRef.current.emit('send-message', {
        roomId,
        text,
        senderName: userName,
      });
    }
  };

  // Copy Room Link
  const handleCopyRoomLink = () => {
    const url = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="w-screen h-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden select-none">
      {!isInCall ? (
        /* Landing / Homepage Form */
        <JoinRoomForm
          onJoin={handleJoinRoom}
          defaultRoomId={urlRoomId}
          errorMessage={errorMessage}
        />
      ) : (
        /* In-Call Room View */
        <div className="relative w-full h-full flex flex-col pt-16 pb-24 px-4 sm:px-6 overflow-hidden">
          {/* Header */}
          <CallHeader
            roomId={roomId}
            hasPeerConnected={!!remotePeer}
            peerName={remotePeer?.userName}
            onCopyRoomLink={handleCopyRoomLink}
          />

          {/* Main Stage & Chat Container */}
          <div className="flex-1 w-full max-w-7xl mx-auto flex gap-4 items-center justify-center h-full max-h-[calc(100vh-160px)] overflow-hidden transition-all duration-300">
            {/* Video Stage Grid */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 items-center justify-center h-full max-h-full transition-all duration-300">
              {/* Local Video Stream */}
              <VideoPlayer
                stream={localStream}
                userName={userName}
                isLocal
                isAudioMuted={isAudioMuted}
                isVideoOff={isVideoOff}
                isScreenSharing={isScreenSharing}
                isNoiseSuppressed={isNoiseSuppressed}
                className="w-full h-full max-h-[70vh] aspect-video"
              />

              {/* Remote Video Stream or Waiting Box */}
              {remotePeer ? (
                <VideoPlayer
                  stream={remoteStream}
                  userName={remotePeer.userName}
                  isAudioMuted={remotePeer.mediaStatus.isAudioMuted}
                  isVideoOff={remotePeer.mediaStatus.isVideoOff}
                  isScreenSharing={remotePeer.mediaStatus.isScreenSharing}
                  isNoiseSuppressed={remotePeer.mediaStatus.isNoiseSuppressed}
                  className="w-full h-full max-h-[70vh] aspect-video"
                />
              ) : (
                /* Waiting Box when peer hasn't entered room yet */
                <div className="w-full h-full max-h-[70vh] aspect-video bg-slate-900/60 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/20 animate-pulse">
                    <UserCheck className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-1">
                    Đang chờ người thứ 2 tham gia...
                  </h3>
                  <p className="text-xs text-slate-400 max-w-xs mb-4">
                    Gửi mã phòng <span className="font-mono text-blue-400 font-bold uppercase">{roomId}</span> hoặc sao chép liên kết dưới đây để mời bạn bè tham gia.
                  </p>
                  <button
                    onClick={handleCopyRoomLink}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-medium flex items-center gap-2 transition-all"
                  >
                    <Share2 className="w-4 h-4 text-blue-400" />
                    Sao chép liên kết mời
                  </button>
                </div>
              )}
            </div>

            {/* Dedicated Chat Panel (Side-by-side, zero overlap) */}
            {isChatOpen && (
              <div className="w-80 sm:w-96 h-full max-h-full shrink-0 transition-all duration-300">
                <ChatPanel
                  isOpen={isChatOpen}
                  onClose={() => setIsChatOpen(false)}
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  onClearMessages={() => setMessages([])}
                />
              </div>
            )}
          </div>

          {/* Bottom Controls Bar */}
          <ControlBar
            isAudioMuted={isAudioMuted}
            isVideoOff={isVideoOff}
            isScreenSharing={isScreenSharing}
            isNoiseSuppressed={isNoiseSuppressed}
            isChatOpen={isChatOpen}
            unreadCount={unreadCount}
            roomId={roomId}
            onToggleAudio={handleToggleAudio}
            onToggleVideo={handleToggleVideo}
            onToggleScreenShare={handleToggleScreenShare}
            onToggleNoiseFilter={handleToggleNoiseFilter}
            onToggleChat={() => {
              setIsChatOpen((prev) => !prev);
              if (!isChatOpen) setUnreadCount(0);
            }}
            onLeaveCall={handleLeaveCall}
          />
        </div>
      )}
    </div>
  );
}
