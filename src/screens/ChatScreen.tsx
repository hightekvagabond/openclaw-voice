/**
 * Main voice chat screen
 *
 * Big central button to start/stop conversation.
 * Shows current phase, transcript, and recent messages.
 * Tap while speaking to interrupt.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Animated,
  StatusBar,
} from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAppStore } from '../stores/appStore';
import * as Conversation from '../services/conversation';
import { ChatMessage, ConversationPhase } from '../types';

const PHASE_LABELS: Record<ConversationPhase, string> = {
  idle: 'Tap to start',
  listening: '🎙️ Listening...',
  processing: '🤔 Thinking...',
  speaking: '🔊 Speaking...',
};

const PHASE_COLORS: Record<ConversationPhase, string> = {
  idle: '#3a3a5c',
  listening: '#e94560',
  processing: '#f5a623',
  speaking: '#4ecdc4',
};

interface Props {
  onOpenSettings: () => void;
}

export default function ChatScreen({ onOpenSettings }: Props) {
  const {
    phase, setPhase,
    connectionState,
    messages, addMessage,
    partialTranscript, setPartialTranscript,
    modelReady,
  } = useAppStore();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const flatListRef = useRef<FlatList>(null);

  // Pulse animation for the main button
  useEffect(() => {
    if (phase === 'listening') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else if (phase === 'processing') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.9, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [phase]);

  // Keep screen awake during conversation
  useEffect(() => {
    if (phase !== 'idle') {
      activateKeepAwakeAsync();
    } else {
      deactivateKeepAwake();
    }
  }, [phase]);

  // Auto-scroll messages
  useEffect(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  const handleMainButton = async () => {
    if (phase === 'idle') {
      await Conversation.start();
    } else if (phase === 'speaking') {
      await Conversation.interrupt();
    } else if (phase === 'listening' || phase === 'processing') {
      await Conversation.stop();
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View style={[
      styles.messageBubble,
      item.role === 'user' ? styles.userBubble : styles.assistantBubble,
    ]}>
      <Text style={[
        styles.messageText,
        item.role === 'user' ? styles.userText : styles.assistantText,
      ]}>
        {item.text}
      </Text>
    </View>
  );

  const isReady = modelReady && connectionState === 'connected';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>OpenClaw Voice</Text>
          <View style={styles.statusRow}>
            <View style={[
              styles.statusDot,
              { backgroundColor: connectionState === 'connected' ? '#4ecdc4' : connectionState === 'connecting' ? '#f5a623' : '#e94560' }
            ]} />
            <Text style={styles.statusText}>
              {connectionState === 'connected' ? 'Connected' :
               connectionState === 'connecting' ? 'Connecting...' :
               'Disconnected'}
            </Text>
            {!modelReady && (
              <Text style={styles.statusText}> • Model loading...</Text>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={onOpenSettings} style={styles.settingsButton}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderMessage}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🦞</Text>
            <Text style={styles.emptyText}>
              {isReady
                ? "Tap the button below to start talking"
                : "Configure your gateway in settings"}
            </Text>
          </View>
        }
      />

      {/* Partial transcript */}
      {partialTranscript ? (
        <View style={styles.transcriptBar}>
          <Text style={styles.transcriptText} numberOfLines={2}>
            {partialTranscript}
          </Text>
        </View>
      ) : null}

      {/* Main button */}
      <View style={styles.buttonContainer}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[
              styles.mainButton,
              { backgroundColor: PHASE_COLORS[phase] },
              !isReady && styles.buttonDisabled,
            ]}
            onPress={handleMainButton}
            disabled={!isReady}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonIcon}>
              {phase === 'idle' ? '🎙️' :
               phase === 'listening' ? '⏹️' :
               phase === 'processing' ? '⏳' :
               '✋'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
        <Text style={styles.phaseLabel}>{PHASE_LABELS[phase]}</Text>
        {phase === 'speaking' && (
          <Text style={styles.interruptHint}>Tap to interrupt</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#16162a',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e0e0e0',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#888',
  },
  settingsButton: {
    padding: 8,
  },
  settingsIcon: {
    fontSize: 24,
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    padding: 16,
    paddingBottom: 8,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#e94560',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#252542',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#fff',
  },
  assistantText: {
    color: '#e0e0e0',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  transcriptBar: {
    backgroundColor: '#252542',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#3a3a5c',
  },
  transcriptText: {
    color: '#b0b0b0',
    fontSize: 14,
    fontStyle: 'italic',
  },
  buttonContainer: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingBottom: 50,
    backgroundColor: '#16162a',
  },
  mainButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonIcon: {
    fontSize: 40,
  },
  phaseLabel: {
    marginTop: 12,
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  interruptHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#666',
  },
});
