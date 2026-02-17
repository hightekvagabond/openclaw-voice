/**
 * OpenClaw Voice — Main App
 *
 * Wires up gateway connection, whisper model, and conversation manager.
 * Shows settings on first launch (no saved config) or chat screen otherwise.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAppStore } from './stores/appStore';
import * as Gateway from './services/gateway';
import * as Whisper from './services/whisper';
import * as Conversation from './services/conversation';
import ChatScreen from './screens/ChatScreen';
import SettingsScreen from './screens/SettingsScreen';

type Screen = 'loading' | 'settings' | 'chat';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const {
    setConnectionState,
    setPhase,
    addMessage,
    setPartialTranscript,
    setModelReady,
    setModelProgress,
    setGatewayConfig,
    gatewayConfig,
    modelProgress,
  } = useAppStore();

  // Bootstrap: load saved config, init whisper, connect to gateway
  useEffect(() => {
    bootstrap();
  }, []);

  async function bootstrap() {
    // Load saved gateway config
    const savedUrl = await SecureStore.getItemAsync('gateway_url');
    const savedToken = await SecureStore.getItemAsync('gateway_token');

    if (!savedUrl || !savedToken) {
      setScreen('settings');
      return;
    }

    const config = { url: savedUrl, token: savedToken };
    setGatewayConfig(config);

    // Init conversation manager
    Conversation.init({
      onPhaseChange: (phase) => setPhase(phase),
      onTranscript: (text, isFinal) => {
        if (!isFinal) setPartialTranscript(text);
        else setPartialTranscript('');
      },
      onNewMessage: (msg) => addMessage(msg),
    });

    // Connect to gateway
    Gateway.onStateChange((state) => setConnectionState(state));
    Gateway.connect(config);

    // Init whisper model (download if needed)
    setScreen('chat');
    try {
      await Whisper.initWhisper((progress) => {
        setModelProgress(progress);
      });
      setModelReady(true);
    } catch (err) {
      console.error('[app] whisper init failed:', err);
      // Still show chat screen — user can configure settings
    }
  }

  function handleSettingsSaved() {
    const config = useAppStore.getState().gatewayConfig;
    if (!config) return;

    // Init conversation if not already
    Conversation.init({
      onPhaseChange: (phase) => setPhase(phase),
      onTranscript: (text, isFinal) => {
        if (!isFinal) setPartialTranscript(text);
        else setPartialTranscript('');
      },
      onNewMessage: (msg) => addMessage(msg),
    });

    // (Re)connect gateway
    Gateway.onStateChange((state) => setConnectionState(state));
    Gateway.connect(config);

    // Init whisper if not ready
    if (!useAppStore.getState().modelReady) {
      Whisper.initWhisper((progress) => setModelProgress(progress))
        .then(() => setModelReady(true))
        .catch((err) => console.error('[app] whisper init failed:', err));
    }

    setScreen('chat');
  }

  if (screen === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingIcon}>🦞</Text>
        <ActivityIndicator size="large" color="#e94560" />
        {modelProgress > 0 && modelProgress < 1 && (
          <View style={styles.progressContainer}>
            <Text style={styles.loadingText}>
              Downloading Whisper model... {Math.round(modelProgress * 100)}%
            </Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${modelProgress * 100}%` }]} />
            </View>
          </View>
        )}
      </View>
    );
  }

  if (screen === 'settings') {
    return <SettingsScreen onSaved={handleSettingsSaved} />;
  }

  return (
    <ChatScreen onOpenSettings={() => setScreen('settings')} />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
  },
  progressContainer: {
    marginTop: 16,
    alignItems: 'center',
    width: '60%',
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: '#252542',
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#e94560',
    borderRadius: 3,
  },
});
