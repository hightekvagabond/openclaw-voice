/**
 * Settings screen — Gateway URL, token, voice preferences
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAppStore } from '../stores/appStore';

const GATEWAY_URL_KEY = 'gateway_url';
const GATEWAY_TOKEN_KEY = 'gateway_token';

interface Props {
  onSaved: () => void;
}

export default function SettingsScreen({ onSaved }: Props) {
  const { gatewayConfig, setGatewayConfig, silenceMs, setSilenceMs, ttsRate, setTtsRate } = useAppStore();

  const [url, setUrl] = useState(gatewayConfig?.url || 'ws://');
  const [token, setToken] = useState(gatewayConfig?.token || '');
  const [silence, setSilence] = useState(String(silenceMs));
  const [rate, setRate] = useState(String(ttsRate));

  // Load saved config on mount
  useEffect(() => {
    (async () => {
      const savedUrl = await SecureStore.getItemAsync(GATEWAY_URL_KEY);
      const savedToken = await SecureStore.getItemAsync(GATEWAY_TOKEN_KEY);
      if (savedUrl) setUrl(savedUrl);
      if (savedToken) setToken(savedToken);
    })();
  }, []);

  const handleSave = async () => {
    if (!url.trim() || !token.trim()) {
      Alert.alert('Missing fields', 'Gateway URL and token are required.');
      return;
    }

    // Validate URL format
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      Alert.alert('Invalid URL', 'Gateway URL must start with ws:// or wss://');
      return;
    }

    await SecureStore.setItemAsync(GATEWAY_URL_KEY, url.trim());
    await SecureStore.setItemAsync(GATEWAY_TOKEN_KEY, token.trim());

    setGatewayConfig({ url: url.trim(), token: token.trim() });
    setSilenceMs(parseInt(silence) || 1500);
    setTtsRate(parseFloat(rate) || 1.0);

    onSaved();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>⚙️ Settings</Text>

      <Text style={styles.label}>Gateway URL</Text>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder="ws://100.64.1.2:18789"
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Text style={styles.hint}>
        Your OpenClaw gateway WebSocket address (Tailscale IP recommended)
      </Text>

      <Text style={styles.label}>Auth Token</Text>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        placeholder="gateway auth token"
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <Text style={styles.hint}>
        From gateway.auth.token in your openclaw.json
      </Text>

      <Text style={styles.sectionTitle}>Voice</Text>

      <Text style={styles.label}>Silence threshold (ms)</Text>
      <TextInput
        style={styles.input}
        value={silence}
        onChangeText={setSilence}
        placeholder="1500"
        placeholderTextColor="#666"
        keyboardType="numeric"
      />
      <Text style={styles.hint}>
        How long to wait after you stop speaking before sending (500-5000ms)
      </Text>

      <Text style={styles.label}>Speech rate</Text>
      <TextInput
        style={styles.input}
        value={rate}
        onChangeText={setRate}
        placeholder="1.0"
        placeholderTextColor="#666"
        keyboardType="decimal-pad"
      />
      <Text style={styles.hint}>
        TTS speed: 0.5 (slow) to 2.0 (fast)
      </Text>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Save & Connect</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#e0e0e0',
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#e0e0e0',
    marginTop: 24,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#b0b0b0',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#252542',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#e0e0e0',
    borderWidth: 1,
    borderColor: '#3a3a5c',
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: '#e94560',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 40,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
