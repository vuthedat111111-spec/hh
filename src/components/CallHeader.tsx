import React, { useState, useEffect } from 'react';
import { Users, Copy, Check, Clock, ShieldCheck } from 'lucide-react';

interface CallHeaderProps {
  roomId: string;
  hasPeerConnected: boolean;
  peerName?: string;
  onCopyRoomLink: () => void;
}

export const CallHeader: React.FC<CallHeaderProps> = ({
  roomId,
  hasPeerConnected,
  peerName,
  onCopyRoomLink,
}) => {
  const [copied, setCopied] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopy = () => {
    onCopyRoomLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-20 px-4 py-3 bg-gradient-to-b from-slate-950/90 to-transparent backdrop-blur-sm flex items-center justify-between text-xs sm:text-sm">
      {/* Room Code Badge */}
      <div className="flex items-center gap-2">
        <div className="bg-slate-900/90 border border-slate-800 text-slate-200 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-lg">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          <span className="text-slate-400 font-normal hidden sm:inline">Mã phòng:</span>
          <span className="font-mono font-bold tracking-wider text-blue-400 uppercase">{roomId}</span>
          <button
            onClick={handleCopy}
            title="Sao chép link phòng"
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Timer & Peer Status */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Call Timer */}
        <div className="bg-slate-900/90 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-xl font-mono text-xs flex items-center gap-1.5 shadow-lg">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{formatTime(seconds)}</span>
        </div>

        {/* Peer Status Badge */}
        <div className="bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-lg">
          <span className={`w-2.5 h-2.5 rounded-full ${hasPeerConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-medium text-slate-200">
            {hasPeerConnected ? (
              <span className="text-emerald-400 font-semibold">2/2 ({peerName || 'Đã vào'})</span>
            ) : (
              <span className="text-amber-400">1/2 (Chờ người thứ 2)</span>
            )}
          </span>
        </div>
      </div>
    </header>
  );
};
