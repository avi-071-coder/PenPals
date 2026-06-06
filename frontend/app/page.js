'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';

const Editor = dynamic(() => import('../components/Editor'), { ssr: false });

const COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'
];

const THEMES = [
  { id: 'glass', name: 'Glassmorphism', desc: 'Frosted & vibrant' },
  { id: 'netflix', name: 'Netflix Dark', desc: 'Cinematic deep black & red' },
  { id: 'spotify', name: 'Spotify Retro', desc: 'Neon green & charcoal' },
  { id: 'sunset', name: 'Sunset Glow', desc: 'Warm amber & violet' },
  { id: 'cyberpunk', name: 'Cyberpunk', desc: 'Neon & glitchy' },
  { id: 'dark', name: 'Sleek Dark', desc: 'Minimal charcoal' },
  { id: 'sepia', name: 'Cozy Sepia', desc: 'Warm paper tone' }
];

function HomeContent() {
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [selectedColor] = useState(() => COLORS[Math.floor(Math.random() * COLORS.length)]);
  const [selectedTheme, setSelectedTheme] = useState('glass');
  const [isEditing, setIsEditing] = useState(false);
  const [forcedReadOnly, setForcedReadOnly] = useState(false);
  
  const searchParams = useSearchParams();

  useEffect(() => {
    const room = searchParams.get('room');
    const readOnly = searchParams.get('readOnly') === 'true';
    if (room) {
      setRoomId(room);
      if (readOnly) {
        setForcedReadOnly(true);
      }
    }
  }, [searchParams]);

  const createRoom = () => {
    const id = 'room-' + Math.random().toString(36).substring(2, 11);
    setRoomId(id);
    setIsEditing(true);
  };

  const joinRoom = () => {
    if (roomId.trim()) {
      setIsEditing(true);
    }
  };

  if (isEditing) {
    return (
      <Editor
        roomId={roomId}
        initialUsername={username}
        initialColor={selectedColor}
        initialTheme={selectedTheme}
        forcedReadOnly={forcedReadOnly}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-indigo-950 to-neutral-950 flex items-center justify-center p-6 relative overflow-hidden">
      
      {/* Decorative animated glow circles */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="bg-zinc-900/60 backdrop-blur-2xl rounded-3xl p-8 md:p-10 border border-white/10 shadow-2xl max-w-xl w-full text-white z-10"
      >
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black bg-gradient-to-r from-white via-indigo-200 to-zinc-400 bg-clip-text text-transparent mb-2 tracking-tight">
            PenPals
          </h1>
          <p className="text-zinc-400 text-sm">Real-time collaborative markdown & rich text editor</p>
        </div>

        <div className="space-y-6">
          {/* Section: Profile */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold tracking-wider uppercase text-zinc-400">Your Nickname</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name (e.g. Creative Fox)..."
              className="w-full px-5 py-3.5 bg-zinc-950/40 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition-all font-medium text-sm"
            />
          </div>

          {/* Section: Themes */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold tracking-wider uppercase text-zinc-400">Choose Editor Theme</label>
            <div className="grid grid-cols-2 gap-2.5 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
              {THEMES.map(theme => (
                <button
                  key={theme.id}
                  onClick={() => setSelectedTheme(theme.id)}
                  className={`p-3 text-left rounded-xl border transition-all ${
                    selectedTheme === theme.id 
                      ? 'bg-indigo-600/20 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]' 
                      : 'bg-zinc-950/35 border-white/5 hover:bg-zinc-800/40 hover:border-white/10'
                  }`}
                >
                  <div className="font-semibold text-xs text-zinc-200">{theme.name}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{theme.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Section: Room Entry */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold tracking-wider uppercase text-zinc-400">Room Details</label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter Room ID to join, or leave empty to create..."
              className="w-full px-5 py-3.5 bg-zinc-950/40 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition-all font-medium text-sm"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={createRoom}
              className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98] text-sm"
            >
              Create New Room
            </button>
            <button
              onClick={joinRoom}
              disabled={!roomId.trim()}
              className="flex-1 py-3.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-white font-bold rounded-xl transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none text-sm"
            >
              Join Room
            </button>
          </div>

          <div className="text-center text-zinc-500 text-xs">
            ✨ Real-time updates • Version backups • Collaborative chat
          </div>
        </div>
      </motion.div>

      {/* Styled scrollbar CSS injection */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 99px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 99px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>

    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-indigo-950 flex items-center justify-center">
        <div className="text-white text-sm animate-pulse font-semibold">Loading PenPals...</div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}