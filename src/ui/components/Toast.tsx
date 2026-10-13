import React, { createContext, useContext, useState, useCallback } from 'react';

interface ToastContextValue {
  showToast: (message: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: '',
    visible: false,
  });

  const showToast = useCallback((message: string, durationMs = 2500) => {
    setToast({ message, visible: true });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, durationMs);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast.visible && (
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--md-sys-color-secondary-container)',
            color: 'var(--md-sys-color-on-secondary-container)',
            padding: '12px 24px',
            borderRadius: 'var(--md-sys-shape-corner-full)',
            boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
            fontSize: '14px',
            fontWeight: 600,
            zIndex: 100,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
};