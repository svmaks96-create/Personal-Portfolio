"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!mounted) {
    return <div className="h-9 w-9" />;
  }

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
