/**
 * Text-to-Speech using Android native TTS (via expo-speech)
 *
 * Simple, free, instant. Can be swapped for ElevenLabs/OpenAI later.
 */

import * as Speech from 'expo-speech';

let _isSpeaking = false;
let _onDone: (() => void) | null = null;
let _onStart: (() => void) | null = null;

/**
 * Speak text. Returns a promise that resolves when speech finishes.
 */
export function speak(text: string, options?: {
  rate?: number;     // 0.5 - 2.0, default 1.0
  pitch?: number;    // 0.5 - 2.0, default 1.0
  voice?: string;    // Android voice identifier
  onStart?: () => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    // Stop any current speech
    if (_isSpeaking) {
      Speech.stop();
    }

    _isSpeaking = true;

    Speech.speak(text, {
      language: 'en-US',
      rate: options?.rate ?? 1.0,
      pitch: options?.pitch ?? 1.0,
      voice: options?.voice,
      onStart: () => {
        _isSpeaking = true;
        options?.onStart?.();
      },
      onDone: () => {
        _isSpeaking = false;
        resolve();
      },
      onError: (err) => {
        _isSpeaking = false;
        reject(err);
      },
      onStopped: () => {
        _isSpeaking = false;
        resolve(); // Resolve on stop too (user interrupt)
      },
    });
  });
}

/**
 * Stop any active speech immediately
 */
export function stopSpeaking(): void {
  if (_isSpeaking) {
    Speech.stop();
    _isSpeaking = false;
  }
}

/**
 * Check if currently speaking
 */
export function isSpeaking(): boolean {
  return _isSpeaking;
}

/**
 * List available voices on this device
 */
export async function getVoices(): Promise<Speech.Voice[]> {
  return Speech.getAvailableVoicesAsync();
}
