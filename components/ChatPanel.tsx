'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { RoomChatMessage } from '@/lib/types';

export default function ChatPanel({
  messages,
  currentUserId,
  onClose,
  onSend,
}: {
  messages: RoomChatMessage[];
  currentUserId: string;
  onClose: () => void;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text.slice(0, 500));
    setDraft('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  }

  return (
    <aside
      aria-label="Chat da chamada"
      className="fixed inset-y-0 right-0 z-[90] flex w-full flex-col border-l border-surface-border bg-surface-soft shadow-2xl animate-fadeIn sm:w-96"
    >
      <header className="flex items-center justify-between border-b border-surface-border px-4 py-4">
        <div>
          <h2 className="font-semibold text-white">Chat da chamada</h2>
          <p className="mt-0.5 text-xs text-white/50">Mensagens para todos na sala</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar chat"
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-surface-border hover:text-white"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/30 to-brand-800/30 text-brand-200">
              <span className="text-xl" aria-hidden="true">✦</span>
            </div>
            <p className="mt-3 text-sm font-medium text-white/80">Nenhuma mensagem ainda</p>
            <p className="mt-1 max-w-56 text-xs leading-relaxed text-white/45">
              As mensagens são texto simples. O suporte a comandos pode ser adicionado depois.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const isMine = message.senderId === currentUserId;
            return (
              <article key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl border px-3 py-2.5 ${
                    isMine
                      ? 'rounded-br-md border-brand-500/30 bg-gradient-to-br from-brand-700/70 to-brand-900/65'
                      : 'rounded-bl-md border-surface-border bg-surface-card'
                  }`}
                >
                  <div className="mb-1 flex items-baseline justify-between gap-4">
                    <span className="truncate text-[11px] font-semibold text-white/75">
                      {isMine ? 'Você' : message.senderName}
                    </span>
                    <time className="shrink-0 text-[10px] text-white/40" dateTime={new Date(message.sentAt).toISOString()}>
                      {new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white">{message.text}</p>
                </div>
              </article>
            );
          })
        )}
        <div ref={endOfMessagesRef} />
      </div>

      <form onSubmit={sendMessage} className="border-t border-surface-border p-3">
        <div className="rounded-2xl border border-surface-border bg-surface-card p-2 focus-within:border-brand-500/70">
          <label htmlFor="room-chat-message" className="sr-only">Escreva uma mensagem</label>
          <textarea
            id="room-chat-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 500))}
            onKeyDown={handleKeyDown}
            maxLength={500}
            rows={2}
            placeholder="Escreva uma mensagem…"
            className="max-h-32 min-h-12 w-full resize-none bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-white/35"
          />
          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-[10px] text-white/35">Enter envia · Shift+Enter pula linha</span>
            <button
              type="submit"
              disabled={!draft.trim()}
              className="rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 px-3.5 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Enviar
            </button>
          </div>
        </div>
        <p className="mt-2 text-center text-[10px] text-white/35">Até 500 caracteres · sem histórico após sair da sala</p>
      </form>
    </aside>
  );
}
