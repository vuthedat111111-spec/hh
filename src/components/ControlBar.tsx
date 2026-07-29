import React from 'react';
import { Mic, MicOff, Video, VideoOff, Monitor, VolumeX, Volume2, MessageSquare, PhoneOff } from 'lucide-react';

interface ControlBarProps {
  isAudioMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isNoiseSuppressed: boolean;
  isChatOpen: boolean;
  unreadCount: number;
  roomId: string;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleNoiseFilter: () => void;
  onToggleChat: () => void;
  onLeaveCall: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  isAudioMuted,
  isVideoOff,
  isScreenSharing,
  isNoiseSuppressed,
  isChatOpen,
  unreadCount,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleNoiseFilter,
  onToggleChat,
  onLeaveCall,
}) => {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-full px-4">
      <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-2 sm:gap-3">
        {/* Toggle Audio */}
        <button
          onClick={onToggleAudio}
          title={isAudioMuted ? 'Bật Micro' : 'Tắt Micro'}
          className={`p-3 rounded-xl flex items-center justify-center transition-all ${
            isAudioMuted
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
        >
          {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Toggle Video */}
        <button
          onClick={onToggleVideo}
          title={isVideoOff ? 'Bật Camera' : 'Tắt Camera'}
          className={`p-3 rounded-xl flex items-center justify-center transition-all ${
            isVideoOff
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-slate-800 my-auto" />

        {/* Toggle Screen Share */}
        <button
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Dừng chia sẻ màn hình' : 'Chia sẻ màn hình'}
          className={`p-3 rounded-xl flex items-center justify-center transition-all ${
            isScreenSharing
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
        >
          <Monitor className="w-5 h-5" />
        </button>

        {/* Toggle Noise Suppression */}
        <button
          onClick={onToggleNoiseFilter}
          title={isNoiseSuppressed ? 'Tắt Lọc tiếng ồn' : 'Bật Lọc tiếng ồn (Web Audio)'}
          className={`p-3 rounded-xl flex items-center justify-center transition-all relative ${
            isNoiseSuppressed
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
        >
          {isNoiseSuppressed ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>

        {/* Toggle Chat */}
        <button
          onClick={onToggleChat}
          title="Trò chuyện"
          className={`p-3 rounded-xl flex items-center justify-center transition-all relative ${
            isChatOpen
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          {unreadCount > 0 && !isChatOpen && (
            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-900 animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-slate-800 my-auto" />

        {/* Leave Call */}
        <button
          onClick={onLeaveCall}
          title="Rời cuộc gọi"
          className="p-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl flex items-center justify-center transition-all shadow-lg shadow-rose-600/30 font-medium"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
