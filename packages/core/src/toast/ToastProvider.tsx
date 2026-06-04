'use client';
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Notification, type StatusKind } from '@app/ui';

export interface ToastInput {
  kind?: StatusKind;
  title?: string;
  message: ReactNode;
  /** Auto-dismiss after N ms; 0 keeps it until closed. Default 4000. */
  duration?: number;
}

interface Toast extends ToastInput {
  id: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Toast queue + bottom-right viewport. Wrap the app; call useToast() to push. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { ...input, id }]);
      const duration = input.duration ?? 4000;
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="fixed right-05 bottom-05 z-[120] flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-03">
        {toasts.map((t) => (
          <Notification
            key={t.id}
            kind={t.kind ?? 'info'}
            title={t.title}
            onClose={() => dismiss(t.id)}
            className="bg-layer-02 shadow-overlay"
          >
            {t.message}
          </Notification>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>');
  return ctx;
}
