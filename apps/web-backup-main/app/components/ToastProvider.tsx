"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { statusColors } from "../lib/statusColors";

type ToastType = "success" | "error";

type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void;
  toastSuccess: (message: string) => void;
  toastError: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = nextIdRef.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  const toastSuccess = useCallback((message: string) => showToast(message, "success"), [showToast]);
  const toastError = useCallback((message: string) => showToast(message, "error"), [showToast]);

  const value: ToastContextValue = {
    toast: showToast,
    toastSuccess,
    toastError,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            pointerEvents: "none",
          }}
          role="status"
          aria-live="polite"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              style={{
                padding: "10px 16px",
                fontSize: 13,
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                maxWidth: "min(400px, 90vw)",
                background: t.type === "success" ? statusColors.success.bg : statusColors.error.bg,
                border: t.type === "success" ? `1px solid ${statusColors.success.border}` : `1px solid ${statusColors.error.border}`,
                color: t.type === "success" ? statusColors.success.text : statusColors.error.text,
                fontWeight: 500,
              }}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: () => {},
      toastSuccess: () => {},
      toastError: () => {},
    };
  }
  return ctx;
}
