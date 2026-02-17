# 🦞 OpenClaw Voice

A React Native Android app for continuous voice conversations with your OpenClaw assistant.

No wake words. No buttons between turns. Just talk naturally, like two people having a conversation.

## How It Works

```
You speak → Whisper (on-device) → text → OpenClaw Gateway → AI response → Android TTS → speaks back → listens again
```

**State machine:**
```
IDLE → [tap] → LISTENING → [silence] → PROCESSING → [reply] → SPEAKING → [done] → LISTENING
                                                                  ↓
                                                          [tap to interrupt]
                                                                  ↓
                                                              LISTENING
```

## Tech Stack

| Component | Tech | Cost |
|-----------|------|------|
| STT | whisper.rn (whisper.cpp on-device) | Free, offline |
| TTS | Android native (expo-speech) | Free |
| AI | OpenClaw Gateway (WebSocket) | Your existing setup |
| Framework | React Native + Expo | - |
| Network | Tailscale recommended | Free tier |

## Prerequisites

- Node.js 18+
- Android Studio (for building APK)
- An OpenClaw Gateway running somewhere
- Tailscale (recommended for remote access)

## Setup

### 1. Install dependencies

```bash
cd openclaw-voice
npm install
npx expo prebuild --platform android
```

### 2. Download Whisper model

The app auto-downloads the `ggml-tiny` model (~75MB) on first launch.
Or pre-bundle it in `assets/` for offline-first.

### 3. Configure

On first launch, the app shows Settings. Enter:
- **Gateway URL**: `ws://<tailscale-ip>:18789`
- **Auth Token**: Your `gateway.auth.token` from `openclaw.json`

### 4. Build APK

```bash
# Debug APK (for testing)
npx expo run:android

# Release APK
cd android
./gradlew assembleRelease
# APK at: android/app/build/outputs/apk/release/app-release.apk
```

### 5. Build with EAS (alternative)

```bash
npm install -g eas-cli
eas build --platform android --profile preview
```

## Configuration

Settings are stored in Android Secure Storage:

- **Gateway URL** — WebSocket URL to your OpenClaw gateway
- **Auth Token** — Gateway authentication token
- **Silence threshold** — ms of silence before sending (default: 1500ms)
- **Speech rate** — TTS playback speed (default: 1.0)

## Architecture

```
src/
├── services/
│   ├── gateway.ts        # WS client, protocol v3, auth
│   ├── whisper.ts        # On-device STT (whisper.rn)
│   ├── tts.ts            # Android native TTS
│   └── conversation.ts   # State machine, turn management
├── screens/
│   ├── ChatScreen.tsx     # Main voice UI
│   └── SettingsScreen.tsx # Gateway config
├── stores/
│   └── appStore.ts        # Zustand state
├── types/
│   └── index.ts           # TypeScript types
└── App.tsx                # Root component
```

## Network / Security

- Gateway token stored in Android Keystore (via expo-secure-store)
- Tailscale recommended — encrypted WireGuard mesh, no port exposure
- App connects as an `operator` role (same as WebChat)
- No data stored on external servers

## Upgrading TTS

The app uses Android's built-in TTS by default (free, instant). To upgrade:

### ElevenLabs
Replace `tts.ts` with an HTTP client that calls ElevenLabs API and plays the audio buffer.

### OpenClaw Gateway TTS
Have the gateway generate audio via its TTS config and stream it back.
This would require extending the gateway protocol (or using a sidecar HTTP endpoint).

## Troubleshooting

- **"Model loading..."** — First launch downloads ~75MB Whisper model
- **"Disconnected"** — Check gateway URL, token, and network (Tailscale status)
- **No speech detected** — Check microphone permission in Android Settings
- **Silence too short/long** — Adjust in Settings (try 1000-2500ms)

## License

Same as OpenClaw.
