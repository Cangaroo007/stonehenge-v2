"use client";

// apps/web/src/hooks/useVoiceInput.ts
//
// Web Speech API hook for voice → text. en-AU locale per audit §4.3.
//
// SpeechRecognition lives on `window` in Chrome/Edge/Safari. Firefox does
// not implement it; the hook reports `isSupported: false` so the UI can
// show a tooltip and fall back to typing. Deepgram is the V3 path —
// we're not committing to a paid service for the prototype.

import { useCallback, useEffect, useRef, useState } from "react";

// Loose typing for the SpeechRecognition browser API. The DOM lib types
// in TypeScript don't include `SpeechRecognition`; we declare the bits we
// touch here.
interface SpeechRecognitionResultLike {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionAlternativeListLike {
  readonly length: number;
  item(idx: number): SpeechRecognitionResultLike;
  readonly [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionResultEntryLike {
  readonly isFinal: boolean;
  readonly length: number;
  item(idx: number): SpeechRecognitionResultLike;
  readonly [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionResultsLike {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResultEntryLike;
}
interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultsLike;
}
interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
  readonly message?: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

interface SpeechWindow extends Window {
  readonly SpeechRecognition?: SpeechRecognitionConstructor;
  readonly webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseVoiceInputApi {
  readonly isListening: boolean;
  readonly transcript: string;
  readonly startListening: () => void;
  readonly stopListening: () => void;
  readonly clearTranscript: () => void;
  readonly isSupported: boolean;
  readonly error: string | null;
}

export interface UseVoiceInputOptions {
  readonly lang?: string;
  /** Fired with the final transcript once the recognition session ends. */
  readonly onFinal?: (finalTranscript: string) => void;
}

export function useVoiceInput(
  options: UseVoiceInputOptions = {},
): UseVoiceInputApi {
  const lang = options.lang ?? "en-AU";
  const onFinalRef = useRef<((s: string) => void) | undefined>(options.onFinal);
  // Keep the ref current without triggering effect re-runs.
  useEffect(() => {
    onFinalRef.current = options.onFinal;
  }, [options.onFinal]);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState<boolean>(() => getSpeechRecognitionCtor() !== null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const ensureRecognition = useCallback((): SpeechRecognitionLike | null => {
    if (recognitionRef.current) return recognitionRef.current;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return null;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;
    recognitionRef.current = r;
    return r;
  }, [lang]);

  const startListening = useCallback(() => {
    setError(null);
    const r = ensureRecognition();
    if (!r) {
      setError("Voice input is not supported in this browser. Use Chrome, Safari, or Edge.");
      return;
    }
    r.lang = lang;
    setTranscript("");
    setIsListening(true);
    r.onstart = () => setIsListening(true);
    r.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const entry = event.results[i];
        if (!entry) continue;
        const alt = entry[0];
        if (!alt) continue;
        if (entry.isFinal) {
          finalText += alt.transcript;
        } else {
          interim += alt.transcript;
        }
      }
      const combined = (finalText + interim).trim();
      setTranscript(combined);
      if (finalText) {
        onFinalRef.current?.(finalText.trim());
      }
    };
    r.onerror = (event: SpeechRecognitionErrorEventLike) => {
      setError(event.message || event.error || "Voice recognition failed");
      setIsListening(false);
    };
    r.onend = () => setIsListening(false);
    try {
      r.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsListening(false);
    }
  }, [ensureRecognition, lang]);

  const stopListening = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) return;
    try {
      r.stop();
    } catch {
      // Calling stop on an already-stopped recognition throws; ignore.
    }
    setIsListening(false);
  }, []);

  const clearTranscript = useCallback(() => setTranscript(""), []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      const r = recognitionRef.current;
      if (r) {
        try {
          r.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    clearTranscript,
    isSupported,
    error,
  };
}
