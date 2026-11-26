import { useEffect, useState } from 'react';

const GEMINI_KEY_STORAGE = 'bellport-watch:gemini-api-key';
const GEMINI_KEY_EVENT = 'bellport-watch:gemini-key-change';

export function getStoredGeminiApiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (window.localStorage.getItem(GEMINI_KEY_STORAGE) ?? '').trim();
  } catch {
    return '';
  }
}

export function setStoredGeminiApiKey(rawKey: string): void {
  const clean = rawKey.trim();
  if (typeof window !== 'undefined') {
    try {
      if (clean) {
        window.localStorage.setItem(GEMINI_KEY_STORAGE, clean);
      } else {
        window.localStorage.removeItem(GEMINI_KEY_STORAGE);
      }
      window.dispatchEvent(new CustomEvent(GEMINI_KEY_EVENT, { detail: clean }));
    } catch {
      // Ignore storage quota errors
    }
  }
  // Best-effort sync to local dev server if running (harmless no-op on static GitHub Pages)
  if (clean) {
    void fetch('/api/config/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geminiKey: clean }),
    }).catch(() => {});
  }
}

export function clearStoredGeminiApiKey(): void {
  setStoredGeminiApiKey('');
}

export function maskGeminiKey(key: string): string {
  const clean = key.trim();
  if (!clean) return '';
  if (clean.length <= 10) return '••••••••';
  return `${clean.slice(0, 6)}••••${clean.slice(-4)}`;
}

export function useGeminiApiKey(): [string, (next: string) => void] {
  const [key, setKey] = useState<string>(() => getStoredGeminiApiKey());

  useEffect(() => {
    const sync = () => setKey(getStoredGeminiApiKey());
    window.addEventListener(GEMINI_KEY_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(GEMINI_KEY_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return [key, setStoredGeminiApiKey];
}
