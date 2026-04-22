"use client";

import { useSyncExternalStore } from "react";
import { Eye, EyeOff } from "lucide-react";

const STORAGE_KEY = "demo-mode";
const EVENT_NAME = "demo-mode:change";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT_NAME, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT_NAME, callback);
  };
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function getServerSnapshot(): boolean {
  return true;
}

export function DemoModeToggle() {
  const enabled = useSyncExternalStore(subscribe, readEnabled, getServerSnapshot);

  const handleClick = () => {
    const next = !enabled;
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // ignore
    }
    document.documentElement.classList.toggle("demo-mode", next);
    window.dispatchEvent(new Event(EVENT_NAME));
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
      aria-label={enabled ? "Show values" : "Hide values"}
      title={enabled ? "Show values" : "Hide values (demo mode)"}
    >
      {enabled ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </button>
  );
}
