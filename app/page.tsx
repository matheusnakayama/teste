'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateRoomId, normalizeRoomInput } from '@/lib/roomId';

export default function HomePage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  function handleCreateRoom() {
    const roomId = generateRoomId();
    router.push(`/sala/${roomId}`);
  }

  function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeRoomInput(joinCode);
    if (!normalized) {
      setJoinError('Cole um link de convite válido ou digite o código da sala.');
      return;
    }
    router.push(`/sala/${normalized}`);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 sm:px-10 py-6 flex items-center gap-3">
        <LogoMark />
        <span className="font-semibold tracking-tight text-lg">videochamada</span>
      </header>

      <div className="flex-1 flex items-center px-6 sm:px-10">
        <div className="w-full max-w-5xl mx-auto grid md:grid-cols-[1.1fr_0.9fr] gap-14 items-center py-10">
          <section>
            <h1 className="text-balance text-4xl sm:text-5xl font-bold leading-[1.08] tracking-tight">
              Uma sala, um link.
              <br />
              <span className="text-brand-300">Chame quem precisa estar lá.</span>
            </h1>
            <p className="mt-5 text-white/60 text-lg max-w-md leading-relaxed">
              Chamadas de vídeo e áudio direto do navegador, com compartilhamento de tela.
              Sem criar conta, sem instalar nada.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row gap-3 max-w-md">
              <button
                onClick={handleCreateRoom}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-400 active:bg-brand-600 transition-colors px-5 py-3.5 font-semibold text-white shadow-lg shadow-brand-900/40"
              >
                <PlusIcon />
                Criar sala
              </button>
            </div>

            <form onSubmit={handleJoinRoom} className="mt-4 max-w-md">
              <div className="flex flex-col sm:flex-row gap-3">
                <label htmlFor="join-code" className="sr-only">
                  Link ou código da sala
                </label>
                <input
                  id="join-code"
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value);
                    if (joinError) setJoinError(null);
                  }}
                  placeholder="Cole o link ou digite o código"
                  className="flex-1 rounded-xl bg-surface-card border border-surface-border px-4 py-3.5 text-white placeholder:text-white/35 focus:border-brand-400 outline-none transition-colors"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface-card hover:bg-surface-border border border-surface-border transition-colors px-5 py-3.5 font-semibold text-white"
                >
                  Entrar em uma sala
                </button>
              </div>
              {joinError && (
                <p role="alert" className="mt-2 text-sm text-danger animate-fadeIn">
                  {joinError}
                </p>
              )}
            </form>
          </section>

          <section aria-hidden="true" className="hidden md:block">
            <PreviewMock />
          </section>
        </div>
      </div>

      <footer className="px-6 sm:px-10 py-6 text-sm text-white/35">
        Funciona em navegadores modernos (Chrome, Edge, Firefox, Safari). É necessário
        permitir o acesso à câmera e ao microfone quando solicitado.
      </footer>
    </main>
  );
}

function LogoMark() {
  return (
    <div className="h-9 w-9 rounded-lg bg-brand-500 flex items-center justify-center">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M15 8.5v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1Z"
          stroke="white"
          strokeWidth="1.8"
        />
        <path
          d="m15 10.8 4.4-2.9a.7.7 0 0 1 1.1.58v7.04a.7.7 0 0 1-1.1.58L15 13.2"
          stroke="white"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function PreviewMock() {
  return (
    <div className="relative rounded-2xl border border-surface-border bg-surface-card p-3 shadow-2xl shadow-black/40">
      <div className="grid grid-cols-2 gap-2">
        <div className="aspect-video rounded-xl bg-gradient-to-br from-brand-700 to-brand-900 flex items-end p-2">
          <span className="text-xs font-medium text-white/90 bg-black/30 rounded px-1.5 py-0.5">
            Você
          </span>
        </div>
        <div className="aspect-video rounded-xl bg-gradient-to-br from-[#2a2f45] to-[#1a1d2b] flex items-end p-2 ring-2 ring-success/70">
          <span className="text-xs font-medium text-white/90 bg-black/30 rounded px-1.5 py-0.5">
            Marina
          </span>
        </div>
        <div className="aspect-video rounded-xl bg-gradient-to-br from-[#33283f] to-[#1a1d2b] flex items-end p-2">
          <span className="text-xs font-medium text-white/90 bg-black/30 rounded px-1.5 py-0.5">
            Diego
          </span>
        </div>
        <div className="aspect-video rounded-xl bg-gradient-to-br from-[#243a3a] to-[#1a1d2b] flex items-end p-2">
          <span className="text-xs font-medium text-white/90 bg-black/30 rounded px-1.5 py-0.5">
            Carla
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2.5 rounded-xl bg-surface py-2.5">
        <MockButton />
        <MockButton />
        <MockButton danger />
      </div>
    </div>
  );
}

function MockButton({ danger }: { danger?: boolean }) {
  return (
    <div
      className={`h-9 w-9 rounded-full ${
        danger ? 'bg-danger' : 'bg-surface-border'
      } flex items-center justify-center`}
    >
      <div className="h-3 w-3 rounded-sm bg-white/70" />
    </div>
  );
}
