import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";

/** Buttons inside a form[method=dialog] close it. */
export function Modal({ open, onClose, title, children, actions, className = "w-[min(380px,calc(100vw-32px))] text-center" }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; actions: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className={`m-auto rounded-card bg-surface p-5 text-ink shadow-overlay animate-pop-in ${className}`}>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <div className="mt-2 text-[13px] leading-relaxed text-ink-2">{children}</div>
      <form method="dialog" className="mt-4 flex justify-center gap-2">{actions}</form>
    </dialog>
  );
}

export function Confirm({ open, onClose, title, message, confirmLabel, onConfirm }: {
  open: boolean; onClose: () => void; title: string; message: ReactNode; confirmLabel: string; onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      actions={<><Button type="submit">Cancel</Button><Button type="submit" variant="danger" onClick={onConfirm}>{confirmLabel}</Button></>}>
      {message}
    </Modal>
  );
}
