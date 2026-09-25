'use client';

export default function ErrorBanner({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="w-full max-w-md rounded-xl border border-danger/40 bg-danger/10 px-4 py-3.5 text-sm animate-fadeIn"
    >
      <p className="font-semibold text-danger">{title}</p>
      <p className="mt-1 text-white/75 leading-relaxed">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-lg bg-white/10 hover:bg-white/15 transition-colors px-3 py-1.5 text-sm font-medium text-white"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
