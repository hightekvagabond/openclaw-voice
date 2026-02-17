// Gateway protocol types (v3)

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type ConversationPhase = 'idle' | 'listening' | 'processing' | 'speaking';

export interface GatewayConfig {
  url: string;       // e.g. ws://100.64.1.2:18789
  token: string;     // gateway auth token
}

export interface GatewayRequest {
  type: 'req';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface GatewayResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface GatewayEvent {
  type: 'event';
  event: string;
  payload: Record<string, unknown>;
  seq?: number;
}

export type GatewayFrame = GatewayResponse | GatewayEvent;

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface WhisperConfig {
  modelPath: string;
  language: string;
}
