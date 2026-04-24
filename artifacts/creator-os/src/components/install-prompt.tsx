import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "vidly_install_dismissed_at";
const SNOOZE_DAYS = 7;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari standalone
  if ((window.navigator as unknown as { standalone?: boolean }).standalone) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

export function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const ageMs = Date.now() - Number(dismissed);
      if (ageMs < SNOOZE_DAYS * 24 * 60 * 60 * 1000) return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);

    return () =>
      window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, []);

  if (!open || !evt) return null;

  const onInstall = async () => {
    try {
      await evt.prompt();
      await evt.userChoice;
    } finally {
      setOpen(false);
      setEvt(null);
    }
  };

  const onDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setOpen(false);
    setEvt(null);
  };

  return (
    <div className="fixed inset-x-3 bottom-20 z-50 lg:left-auto lg:right-4 lg:bottom-4 lg:w-[360px]">
      <div className="rounded-xl border border-border bg-card/95 backdrop-blur shadow-xl p-3 flex items-center gap-3">
        <img
          src="/vidly-logo.png"
          alt=""
          className="h-10 w-10 rounded-lg object-cover shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Install Vidly Studio</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Add to your home screen for app-like access.
          </p>
        </div>
        <button
          onClick={onInstall}
          className="inline-flex items-center gap-1 h-9 px-3 rounded-lg gradient-primary text-white text-xs font-semibold shrink-0"
        >
          <Download className="h-3.5 w-3.5" /> Install
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
