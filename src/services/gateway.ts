/**
 * OpenClaw Gateway WebSocket client (protocol v3)
 *
 * Handles connection, authentication, chat.send, and chat.subscribe.
 * The gateway expects:
 *   1. A connect challenge event from server
 *   2. A connect request from client with auth token
 *   3. Then normal req/res + event flow
 */

import { GatewayConfig, GatewayRequest, GatewayResponse, GatewayEvent, GatewayFrame } from '../types';

type MessageHandler = (text: string, messageId?: string) => void;
type StateHandler = (state: 'disconnected' | 'connecting' | 'connected' | 'error') => void;

let _ws: WebSocket | null = null;
let _config: GatewayConfig | null = null;
let _reqId = 0;
let _pendingRequests = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
let _onMessage: MessageHandler | null = null;
let _onStateChange: StateHandler | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _tickTimer: ReturnType<typeof setInterval> | null = null;
let _isConnected = false;

function nextId(): string {
  return `rn-${++_reqId}`;
}

function send(frame: GatewayRequest): Promise<GatewayResponse['payload']> {
  return new Promise((resolve, reject) => {
    if (!_ws || _ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not connected'));
      return;
    }
    _pendingRequests.set(frame.id, { resolve, reject });
    _ws.send(JSON.stringify(frame));

    // Timeout after 30s
    setTimeout(() => {
      if (_pendingRequests.has(frame.id)) {
        _pendingRequests.delete(frame.id);
        reject(new Error(`Request ${frame.method} timed out`));
      }
    }, 30000);
  });
}

function handleFrame(raw: string) {
  let frame: GatewayFrame;
  try {
    frame = JSON.parse(raw);
  } catch {
    console.warn('[gateway] invalid frame:', raw.slice(0, 200));
    return;
  }

  if (frame.type === 'res') {
    const pending = _pendingRequests.get(frame.id);
    if (pending) {
      _pendingRequests.delete(frame.id);
      if (frame.ok) {
        pending.resolve(frame.payload);
      } else {
        pending.reject(new Error(frame.error?.message || 'Unknown error'));
      }
    }
    return;
  }

  if (frame.type === 'event') {
    handleEvent(frame);
  }
}

function handleEvent(event: GatewayEvent) {
  switch (event.event) {
    case 'connect.challenge':
      // Respond with connect request
      doConnect(event.payload?.nonce as string);
      break;

    case 'chat': {
      // Chat event from the agent — extract the assistant reply
      const payload = event.payload as any;
      if (payload?.role === 'assistant' && payload?.text) {
        _onMessage?.(payload.text, payload.messageId);
      }
      // Also handle streamed partial messages
      if (payload?.type === 'message' && payload?.role === 'assistant') {
        _onMessage?.(payload.text, payload.messageId);
      }
      break;
    }

    case 'chat.reply': {
      const payload = event.payload as any;
      if (payload?.text) {
        _onMessage?.(payload.text, payload.messageId);
      }
      break;
    }

    case 'chat.stream': {
      // Streaming partial — we only care about the final
      // Ignore partials for voice; we wait for the complete reply
      break;
    }

    default:
      // console.log('[gateway] event:', event.event);
      break;
  }
}

async function doConnect(nonce?: string) {
  if (!_config) return;

  try {
    const payload = await send({
      type: 'req',
      id: nextId(),
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'openclaw-voice-android',
          version: '0.1.0',
          platform: 'android',
          mode: 'operator',
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        caps: [],
        commands: [],
        permissions: {},
        auth: { token: _config.token },
        locale: 'en-US',
        userAgent: 'openclaw-voice/0.1.0',
        ...(nonce ? { device: { nonce } } : {}),
      },
    });

    console.log('[gateway] connected:', payload);
    _isConnected = true;
    _onStateChange?.('connected');

    // Start tick keepalive
    const tickInterval = (payload as any)?.policy?.tickIntervalMs || 15000;
    if (_tickTimer) clearInterval(_tickTimer);
    _tickTimer = setInterval(() => {
      if (_ws?.readyState === WebSocket.OPEN) {
        send({
          type: 'req',
          id: nextId(),
          method: 'tick',
          params: {},
        }).catch(() => {});
      }
    }, tickInterval);

    // Subscribe to chat events
    await send({
      type: 'req',
      id: nextId(),
      method: 'chat.subscribe',
      params: { session: 'main' },
    });

  } catch (err) {
    console.error('[gateway] connect failed:', err);
    _onStateChange?.('error');
  }
}

function scheduleReconnect() {
  if (_reconnectTimer) return;
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    if (!_isConnected && _config) {
      connect(_config);
    }
  }, 5000);
}

// --- Public API ---

export function connect(config: GatewayConfig) {
  _config = config;
  _isConnected = false;
  _onStateChange?.('connecting');

  if (_ws) {
    _ws.close();
    _ws = null;
  }

  const ws = new WebSocket(config.url);
  _ws = ws;

  ws.onopen = () => {
    console.log('[gateway] ws open');
    // Wait for connect.challenge event from server
  };

  ws.onmessage = (e) => {
    handleFrame(typeof e.data === 'string' ? e.data : '');
  };

  ws.onerror = (e) => {
    console.error('[gateway] ws error:', e);
    _onStateChange?.('error');
  };

  ws.onclose = (e) => {
    console.log('[gateway] ws closed:', e.code, e.reason);
    _isConnected = false;
    if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
    _onStateChange?.('disconnected');
    scheduleReconnect();
  };
}

export function disconnect() {
  _config = null;
  _isConnected = false;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
  if (_ws) { _ws.close(); _ws = null; }
  _pendingRequests.clear();
}

export async function sendMessage(text: string): Promise<void> {
  await send({
    type: 'req',
    id: nextId(),
    method: 'chat.send',
    params: {
      session: 'main',
      text,
    },
  });
}

export function onMessage(handler: MessageHandler) {
  _onMessage = handler;
}

export function onStateChange(handler: StateHandler) {
  _onStateChange = handler;
}

export function isConnected(): boolean {
  return _isConnected;
}
