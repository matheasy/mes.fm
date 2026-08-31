'use client';

interface StateViewProps {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  emptyMessage?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}

export default function StateView({ loading, error, empty, emptyMessage, onRetry, children }: StateViewProps) {
  if (loading) {
    return (
      <div className="panel flex items-center justify-center py-16 text-gray-400">
        <span className="animate-pulse">Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel flex flex-col items-center gap-3 border-loss/40 py-12 text-center">
        <p className="text-loss">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="rounded-md border border-bg-border px-3 py-1.5 text-sm text-gray-200 hover:border-accent hover:text-accent"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <div className="panel py-12 text-center text-gray-400">
        {emptyMessage ?? 'Nothing to show yet.'}
      </div>
    );
  }

  return <>{children}</>;
}
