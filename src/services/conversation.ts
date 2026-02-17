/**
 * Conversation Manager
 *
 * Orchestrates the voice conversation loop:
 *   IDLE → LISTENING → PROCESSING → SPEAKING → LISTENING → ...
 *
 * Handles:
 *   - Automatic turn-taking (silence detection triggers send)
 *   - Interrupt (user speaks while assistant is talking)
 *   - Clean state transitions
 */

import * as Gateway from './gateway';
import * as Whisper from './whisper';
import * as TTS from './tts';
import { ConversationPhase, ChatMessage } from '../types';

type PhaseHandler = (phase: ConversationPhase) => void;
type TranscriptHandler = (text: string, isFinal: boolean) => void;
type MessageHandler = (message: ChatMessage) => void;

let _phase: ConversationPhase = 'idle';
let _onPhaseChange: PhaseHandler | null = null;
let _onTranscript: TranscriptHandler | null = null;
let _onNewMessage: MessageHandler | null = null;
let _activeListener: { stop: () => Promise<Whisper.TranscribeResult> } | null = null;
let _silenceTimer: ReturnType<typeof setTimeout> | null = null;
let _lastPartialText = '';
let _silenceThresholdMs = 1500; // 1.5s of silence triggers send

// Track if we're waiting for a gateway response
let _waitingForResponse = false;

function setPhase(phase: ConversationPhase) {
  if (_phase === phase) return;
  _phase = phase;
  _onPhaseChange?.(phase);
}

/**
 * Initialize the conversation system.
 * Must be called after Gateway.connect() and Whisper.initWhisper().
 */
export function init(handlers: {
  onPhaseChange: PhaseHandler;
  onTranscript: TranscriptHandler;
  onNewMessage: MessageHandler;
}) {
  _onPhaseChange = handlers.onPhaseChange;
  _onTranscript = handlers.onTranscript;
  _onNewMessage = handlers.onNewMessage;

  // Listen for gateway responses
  Gateway.onMessage((text: string) => {
    if (_waitingForResponse) {
      _waitingForResponse = false;
      handleAssistantReply(text);
    }
  });
}

/**
 * Start a conversation (begin listening)
 */
export async function start() {
  if (_phase !== 'idle') return;
  await beginListening();
}

/**
 * Stop the conversation entirely
 */
export async function stop() {
  clearSilenceTimer();
  TTS.stopSpeaking();
  _waitingForResponse = false;

  if (_activeListener) {
    await _activeListener.stop();
    _activeListener = null;
  }

  setPhase('idle');
}

/**
 * Adjust silence threshold (ms)
 */
export function setSilenceThreshold(ms: number) {
  _silenceThresholdMs = Math.max(500, Math.min(5000, ms));
}

export function getPhase(): ConversationPhase {
  return _phase;
}

// --- Internal ---

async function beginListening() {
  setPhase('listening');
  _lastPartialText = '';

  try {
    _activeListener = await Whisper.startListening({
      onPartialResult: (text: string) => {
        _lastPartialText = text;
        _onTranscript?.(text, false);
        resetSilenceTimer();
      },
    });

    // Start the initial silence timer (if user doesn't speak at all for 10s, go idle)
    _silenceTimer = setTimeout(() => {
      if (_phase === 'listening' && !_lastPartialText.trim()) {
        // No speech detected for a long time — stay listening but don't send empty
        // Just reset
        resetSilenceTimer();
      }
    }, 10000);

  } catch (err) {
    console.error('[conversation] failed to start listening:', err);
    setPhase('idle');
  }
}

function resetSilenceTimer() {
  clearSilenceTimer();

  // Only set silence timer if we have some text
  if (_lastPartialText.trim()) {
    _silenceTimer = setTimeout(() => {
      onSilenceDetected();
    }, _silenceThresholdMs);
  }
}

function clearSilenceTimer() {
  if (_silenceTimer) {
    clearTimeout(_silenceTimer);
    _silenceTimer = null;
  }
}

async function onSilenceDetected() {
  if (_phase !== 'listening' || !_activeListener) return;

  // Stop recording and get final transcript
  const result = await _activeListener.stop();
  _activeListener = null;

  const text = result.text.trim();
  if (!text) {
    // Empty transcript — go back to listening
    await beginListening();
    return;
  }

  _onTranscript?.(text, true);

  // Add user message
  _onNewMessage?.({
    role: 'user',
    text,
    timestamp: Date.now(),
  });

  // Send to gateway
  setPhase('processing');
  _waitingForResponse = true;

  try {
    await Gateway.sendMessage(text);
  } catch (err) {
    console.error('[conversation] failed to send message:', err);
    _waitingForResponse = false;
    // Go back to listening on error
    await beginListening();
  }

  // Timeout: if no response in 30s, go back to listening
  setTimeout(() => {
    if (_waitingForResponse && _phase === 'processing') {
      console.warn('[conversation] response timeout');
      _waitingForResponse = false;
      beginListening();
    }
  }, 30000);
}

async function handleAssistantReply(text: string) {
  // Add assistant message
  _onNewMessage?.({
    role: 'assistant',
    text,
    timestamp: Date.now(),
  });

  // Speak the reply
  setPhase('speaking');

  try {
    await TTS.speak(text, {
      onStart: () => {
        // Could show a visual indicator
      },
    });
  } catch (err) {
    console.error('[conversation] TTS error:', err);
  }

  // After speaking, go back to listening (continuous conversation)
  if (_phase === 'speaking') {
    await beginListening();
  }
}

/**
 * Interrupt: user wants to speak while assistant is talking
 */
export async function interrupt() {
  if (_phase === 'speaking') {
    TTS.stopSpeaking();
    await beginListening();
  }
}
