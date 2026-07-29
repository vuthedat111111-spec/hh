import React, { useState, useEffect } from 'react';
import { Video, VideoOff, Mic, MicOff, ArrowRight, RefreshCw, Copy, Check } from 'lucide-react';

interface JoinRoomFormProps {
  onJoin: (roomId: string, userName: string, initialAudioMuted: boolean, initialVideoOff: boolean) => void;
  defaultRoomId?: string;
  errorMessage?: string | null;
}

export const JoinRoomForm: React.FC<JoinRoomFormProps> = ({ onJoin, defaultRoomId, errorMessage }) => {
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Generate initial random room code if none provided
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
    setRoomId(defaultRoomId || randomCode);

    // Read saved username if available
    const savedName = localStorage.getItem('webrtc_user_name');
    if (savedName) setUserName(savedName);
  }, [defaultRoomId]);

  const generateRandomRoom = () => {
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
    setRoomId(randomCode);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim() || !userName.trim()) return;

    localStorage.setItem('webrtc_user_name', userName.trim());
    onJoin(roomId.trim().toLowerCase(), userName.trim(), isAudioMuted, isVideoOff);
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background glow accents */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl z-10">
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl shadow-lg shadow-blue-500/20 mb-4">
            <Video className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            PHÒNG HỌC DORA
          </h1>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm text-center">
            {errorMessage}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* User Name Input */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Tên hiển thị của bạn
            </label>
            <input
              type="text"
              required
              placeholder="VD: Nguyễn Văn A"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>

          {/* Room Code Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Mã phòng họp
              </label>
              <button
                type="button"
                onClick={generateRandomRoom}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Mã ngẫu nhiên
              </button>
            </div>
            <div className="relative flex items-center">
              <input
                type="text"
                required
                placeholder="VD: 849204"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-mono tracking-widest uppercase text-lg"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                title="Sao chép liên kết phòng"
                className="absolute right-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Đã chép' : 'Chép link'}
              </button>
            </div>
          </div>

          {/* Pre-call Media Controls */}
          <div className="bg-slate-800/60 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">
              Thiết lập trước khi vào:
            </span>
            <div className="flex items-center gap-2">
              {/* Mic Toggle */}
              <button
                type="button"
                onClick={() => setIsAudioMuted(!isAudioMuted)}
                title={isAudioMuted ? 'Đang TẮT Micro' : 'Đang BẬT Micro'}
                className={`p-2.5 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-all ${
                  isAudioMuted
                    ? 'bg-rose-600/90 text-white border border-rose-500/50'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600/50'
                }`}
              >
                {isAudioMuted ? <MicOff className="w-4 h-4 text-rose-200" /> : <Mic className="w-4 h-4 text-emerald-400" />}
                <span>{isAudioMuted ? 'Tắt Mic' : 'Bật Mic'}</span>
              </button>

              {/* Camera Toggle */}
              <button
                type="button"
                onClick={() => setIsVideoOff(!isVideoOff)}
                title={isVideoOff ? 'Đang TẮT Camera' : 'Đang BẬT Camera'}
                className={`p-2.5 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-all ${
                  isVideoOff
                    ? 'bg-rose-600/90 text-white border border-rose-500/50'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600/50'
                }`}
              >
                {isVideoOff ? <VideoOff className="w-4 h-4 text-rose-200" /> : <Video className="w-4 h-4 text-emerald-400" />}
                <span>{isVideoOff ? 'Tắt Cam' : 'Bật Cam'}</span>
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!userName.trim() || !roomId.trim()}
            className="w-full py-3.5 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition-all transform active:scale-[0.99]"
          >
            Vào phòng ngay
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};
