/**
 * App state store (Zustand)
 */

import { create } from 'zustand';
import { ConnectionState, ConversationPhase, ChatMessage, GatewayConfig } from '../types';

interface AppState {
  // Connection
  connectionState: ConnectionState;
  setConnectionState: (state: ConnectionState) => void;

  // Conversation
  phase: ConversationPhase;
  setPhase: (phase: ConversationPhase) => void;

  // Messages
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;

  // Current transcript (partial, while listening)
  partialTranscript: string;
  setPartialTranscript: (text: string) => void;

  // Settings
  gatewayConfig: GatewayConfig | null;
  setGatewayConfig: (config: GatewayConfig) => void;

  // Model loading
  modelReady: boolean;
  modelProgress: number;
  setModelReady: (ready: boolean) => void;
  setModelProgress: (progress: number) => void;

  // TTS settings
  ttsRate: number;
  ttsPitch: number;
  setTtsRate: (rate: number) => void;
  setTtsPitch: (pitch: number) => void;

  // Silence threshold
  silenceMs: number;
  setSilenceMs: (ms: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Connection
  connectionState: 'disconnected',
  setConnectionState: (connectionState) => set({ connectionState }),

  // Conversation
  phase: 'idle',
  setPhase: (phase) => set({ phase }),

  // Messages
  messages: [],
  addMessage: (message) => set((state) => ({
    messages: [...state.messages.slice(-50), message], // Keep last 50
  })),
  clearMessages: () => set({ messages: [] }),

  // Transcript
  partialTranscript: '',
  setPartialTranscript: (partialTranscript) => set({ partialTranscript }),

  // Settings
  gatewayConfig: null,
  setGatewayConfig: (gatewayConfig) => set({ gatewayConfig }),

  // Model
  modelReady: false,
  modelProgress: 0,
  setModelReady: (modelReady) => set({ modelReady }),
  setModelProgress: (modelProgress) => set({ modelProgress }),

  // TTS
  ttsRate: 1.0,
  ttsPitch: 1.0,
  setTtsRate: (ttsRate) => set({ ttsRate }),
  setTtsPitch: (ttsPitch) => set({ ttsPitch }),

  // Silence
  silenceMs: 1500,
  setSilenceMs: (silenceMs) => set({ silenceMs }),
}));
