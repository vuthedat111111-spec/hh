import React, { useEffect, useRef } from 'react';
import { MicOff, Monitor, VolumeX, User } from 'lucide-react';

interface VideoPlayerProps {
  stream: MediaStream | null;
  userName: string;
  isLocal?: boolean;
  isAudioMuted?: boolean;
  isVideoOff?: boolean;
  isScreenSharing?: boolean;
  isNoiseSuppressed?: boolean;
  className?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  stream,
  userName,
  isLocal = false,
  isAudioMuted = false,
  isVideoOff = false,
  isScreenSharing = false,
  isNoiseSuppressed = false,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.play().catch((err) => {
        console.warn('Video auto-play error:', err);
      });
    }
  }, [stream]);

  const initial = userName ? userName.charAt(0).toUpperCase() : '?';

  return (
    <div className={`relative bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex items-center justify-center group ${className}`}>
      {/* Video Element (Always mounted if stream exists to preserve srcObject connection) */}
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal} // Always mute local video element to avoid self-echo
          className={`w-full h-full object-contain bg-slate-950 ${isLocal && !isScreenSharing ? 'scale-x-[-1]' : ''} ${
            isVideoOff ? 'hidden' : 'block'
          }`}
        />
      )}

      {/* Video Off Placeholder */}
      {(isVideoOff || !stream) && (
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-tr from-slate-800 to-slate-700 border-2 border-slate-600 rounded-full flex items-center justify-center shadow-lg mb-3">
            <span className="text-3xl sm:text-4xl font-bold text-slate-200">{initial}</span>
          </div>
          <p className="text-sm font-medium text-slate-300">{userName}</p>
          <p className="text-xs text-slate-500 mt-1">Camera đang tắt</p>
        </div>
      )}

      {/* Status Badges Overlay - Top Right */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
        {isNoiseSuppressed && (
          <span className="bg-indigo-600/90 text-white px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 backdrop-blur-md shadow-sm">
            <VolumeX className="w-3 h-3 text-indigo-200" />
            Lọc ồn
          </span>
        )}
        {isScreenSharing && (
          <span className="bg-blue-600/90 text-white px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 backdrop-blur-md shadow-sm">
            <Monitor className="w-3 h-3 text-blue-200" />
            Màn hình
          </span>
        )}
        {isAudioMuted && (
          <span className="bg-rose-600/90 text-white p-1.5 rounded-md backdrop-blur-md shadow-sm" title="Đã tắt Micro">
            <MicOff className="w-3.5 h-3.5" />
          </span>
        )}
      </div>

      {/* User Name Tag - Bottom Left */}
      <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md border border-slate-800 text-slate-100 px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2 z-10 shadow-md">
        <User className="w-3.5 h-3.5 text-blue-400" />
        <span>{userName}</span>
        {isLocal && <span className="bg-blue-500/20 text-blue-400 text-[10px] px-1.5 py-0.5 rounded font-mono">(Bạn)</span>}
      </div>
    </div>
  );
};
