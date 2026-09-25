'use client';

import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import type { RoomChatMessage } from '@/lib/types';
import { ImageIcon } from './icons';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function ChatPanel({
  messages,
  currentUserId,
  isHost,
  hostName,
  onClose,
  onSend,
  onSendImage,
}: {
  messages: RoomChatMessage[];
  currentUserId: string;
  isHost: boolean;
  hostName: string;
  onClose: () => void;
  onSend: (text: string) => void;
  onSendImage: (file: File) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    };
  }, [pendingImage]);

  function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || uploadingImage) return;
    onSend(text.slice(0, 500));
    setDraft('');
  }

  function prepareImage(file: File) {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageError('Escolha uma imagem JPG, PNG, WebP ou GIF.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setImageError('A imagem precisa ter no máximo 5 MB.');
      return;
    }

    setImageError(null);
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  }

  async function uploadImageFile(file: File): Promise<boolean> {
    setUploadingImage(true);
    try {
      await onSendImage(file);
      return true;
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Não foi possível enviar a imagem.');
      return false;
    } finally {
      setUploadingImage(false);
    }
  }

  async function confirmImageSend() {
    if (!pendingImage || uploadingImage) return;
    const sent = await uploadImageFile(pendingImage.file);
    if (sent) setPendingImage(null);
  }

  function cancelImage() {
    setPendingImage(null);
    setImageError(null);
  }

  function handleImageSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) prepareImage(file);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (uploadingImage) return;
    const imageItem = Array.from(event.clipboardData.items).find(
      (item) => item.kind === 'file' && item.type.startsWith('image/')
    );
    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) {
      event.preventDefault();
      setImageError('Não consegui ler a imagem da área de transferência. Tente salvá-la e usar o botão de imagem.');
      return;
    }

    event.preventDefault();
    prepareImage(file);
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
          <p className="mt-0.5 text-xs text-white/50">
            {isHost ? 'Você é o anfitrião' : `Anfitrião: ${hostName || 'conectando…'}`}
          </p>
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
              Envie texto ou imagens para as pessoas desta sala.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            if (message.isSystem) {
              return (
                <p key={message.id} className="mx-auto max-w-[92%] rounded-xl bg-surface-card/70 px-3 py-2 text-center text-xs text-white/55">
                  {message.text}
                </p>
              );
            }
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
                  {message.text && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white">{message.text}</p>}
                  {message.imageUrl && (
                    <a href={message.imageUrl} target="_blank" rel="noreferrer" className="mt-1 block overflow-hidden rounded-xl">
                      <img
                        src={message.imageUrl}
                        alt={`Imagem enviada por ${message.senderName}`}
                        loading="lazy"
                        className="max-h-64 max-w-full rounded-xl object-contain"
                      />
                    </a>
                  )}
                </div>
              </article>
            );
          })
        )}
        <div ref={endOfMessagesRef} />
      </div>

      <form onSubmit={sendMessage} className="border-t border-surface-border p-3">
        {isHost ? (
          <p className="mb-2 text-[10px] leading-relaxed text-white/40">
            Anfitrião: <code>.kick @nome</code> · <code>.mute @nome</code> · <code>.unmute @nome</code> · <code>.promote @nome</code>
          </p>
        ) : (
          <p className="mb-2 text-[10px] text-white/40">A moderação da sala fica com o anfitrião.</p>
        )}
        {pendingImage && (
          <div className="mb-3 rounded-2xl border border-brand-500/35 bg-surface-card p-3">
            <div className="flex items-start gap-3">
              <img
                src={pendingImage.previewUrl}
                alt="Prévia da imagem que será enviada"
                className="max-h-32 max-w-[55%] rounded-xl object-contain"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">Prévia da imagem</p>
                <p className="mt-1 break-words text-xs text-white/50">{pendingImage.file.name || 'Imagem colada'}</p>
                <p className="mt-1 text-[11px] text-white/40">A imagem só será enviada quando você confirmar.</p>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelImage}
                disabled={uploadingImage}
                className="rounded-lg border border-surface-border px-3 py-2 text-xs text-white/75 transition hover:bg-surface-soft disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmImageSend}
                disabled={uploadingImage}
                className="rounded-lg bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {uploadingImage ? 'Enviando…' : 'Enviar imagem'}
              </button>
            </div>
          </div>
        )}
        <div className="rounded-2xl border border-surface-border bg-surface-card p-2 focus-within:border-brand-500/70">
          <label htmlFor="room-chat-message" className="sr-only">Escreva uma mensagem ou comando</label>
          <textarea
            id="room-chat-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 500))}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            maxLength={500}
            rows={2}
            placeholder="Escreva uma mensagem…"
            className="max-h-32 min-h-12 w-full resize-none bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-white/35"
          />
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-2">
              <input
                ref={imageInputRef}
                type="file"
                accept={ALLOWED_IMAGE_TYPES.join(',')}
                onChange={handleImageSelection}
                className="sr-only"
                aria-label="Escolher imagem para enviar"
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingImage}
                aria-label="Enviar imagem"
                title="Enviar uma imagem (máximo 5 MB)"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/65 transition hover:bg-surface-border hover:text-white disabled:opacity-50"
              >
                {uploadingImage ? <span className="text-[10px]">…</span> : <ImageIcon />}
              </button>
              <span className="text-[10px] text-white/35">{uploadingImage ? 'Enviando imagem…' : 'Enter envia · Shift+Enter pula linha · Ctrl+V cola imagem'}</span>
            </div>
            <button
              type="submit"
              disabled={!draft.trim() || uploadingImage}
              className="rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 px-3.5 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Enviar
            </button>
          </div>
        </div>
        {imageError && <p role="alert" className="mt-2 text-xs text-danger">{imageError}</p>}
        <p className="mt-2 text-center text-[10px] leading-relaxed text-white/35">
          Até 500 caracteres · imagem até 5 MB · imagens ficam salvas com link público
        </p>
      </form>
    </aside>
  );
}
