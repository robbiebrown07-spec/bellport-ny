import { useEffect, useState } from 'react';

const GEMINI_KEY_STORAGE = 'bellport-watch:gemini-api-key';
const GEMINI_KEY_EVENT = 'bellport-watch:gemini-key-change';

function sanitizeKeyInput(raw: string): string {
  return raw.trim().replace(/^['"`\s]+|['"`\s]+$/g, '');
}

export function getStoredGeminiApiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    // Support one-time `#gemini_key=...` hash import (auto-strips hash from URL immediately)
    if (window.location.hash.includes('gemini_key=')) {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const fromHash = sanitizeKeyInput(params.get('gemini_key') ?? '');
      if (fromHash) {
        window.localStorage.setItem(GEMINI_KEY_STORAGE, fromHash);
        params.delete('gemini_key');
        const remaining = params.toString();
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}${remaining ? `#${remaining}` : ''}`
        );
        return fromHash;
      }
    }
    return sanitizeKeyInput(window.localStorage.getItem(GEMINI_KEY_STORAGE) ?? '');
  } catch {
    return '';
  }
}

export function setStoredGeminiApiKey(rawKey: string): void {
  const clean = sanitizeKeyInput(rawKey);
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
  const clean = sanitizeKeyInput(key);
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
