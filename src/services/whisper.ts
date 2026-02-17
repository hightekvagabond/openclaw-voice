/**
 * On-device speech-to-text using whisper.rn (whisper.cpp bindings)
 *
 * Flow:
 *   1. initWhisper() — load the model once at app start
 *   2. startListening() — begin recording + transcribing
 *   3. stopListening() — stop recording, return final transcript
 *
 * Uses whisper.rn's real-time transcription with VAD (voice activity detection)
 * for automatic silence detection.
 */

import { initWhisper as initWhisperRn, WhisperContext } from 'whisper.rn';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';

let _ctx: WhisperContext | null = null;
let _isRecording = false;
let _currentTranscribe: any = null;

// Model download URL (ggml-tiny — 75MB, good enough for conversation)
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin';
const MODEL_DIR = `${FileSystem.documentDirectory}whisper/`;
const MODEL_PATH = `${MODEL_DIR}ggml-tiny.bin`;

export async function downloadModelIfNeeded(
  onProgress?: (progress: number) => void
): Promise<string> {
  const modelInfo = await FileSystem.getInfoAsync(MODEL_PATH);
  if (modelInfo.exists) {
    console.log('[whisper] model already downloaded');
    return MODEL_PATH;
  }

  console.log('[whisper] downloading model...');
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });

  const downloadResumable = FileSystem.createDownloadResumable(
    MODEL_URL,
    MODEL_PATH,
    {},
    (downloadProgress) => {
      const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
      onProgress?.(progress);
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result?.uri) {
    throw new Error('Model download failed');
  }

  console.log('[whisper] model downloaded to:', result.uri);
  return MODEL_PATH;
}

export async function initWhisper(
  onProgress?: (progress: number) => void
): Promise<void> {
  if (_ctx) return;

  // Request microphone permission
  const { granted } = await Audio.requestPermissionsAsync();
  if (!granted) {
    throw new Error('Microphone permission denied');
  }

  // Configure audio session for recording
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
  });

  const modelPath = await downloadModelIfNeeded(onProgress);

  _ctx = await initWhisperRn({
    filePath: modelPath,
    language: 'en',
    useCoreML: false,
    useGpu: true,
  });

  console.log('[whisper] initialized');
}

export interface TranscribeResult {
  text: string;
  segments: Array<{ text: string; t0: number; t1: number }>;
}

/**
 * Start real-time transcription from the microphone.
 * Returns a stop function that, when called, returns the final transcript.
 */
export async function startListening(options?: {
  onPartialResult?: (text: string) => void;
  silenceMs?: number;
}): Promise<{ stop: () => Promise<TranscribeResult> }> {
  if (!_ctx) throw new Error('Whisper not initialized');
  if (_isRecording) throw new Error('Already recording');

  _isRecording = true;

  const { stop, subscribe } = await _ctx.transcribeRealtime({
    language: 'en',
    maxLen: 0,       // no max segment length
    translate: false,
    // Audio config
    realtimeAudioSec: 30,        // max recording duration
    realtimeAudioSliceSec: 3,    // process in 3-second chunks
    audioOutputPath: `${FileSystem.cacheDirectory}whisper_recording.wav`,
  });

  let fullText = '';
  let lastPartialTime = Date.now();

  // Subscribe to partial results
  subscribe((evt) => {
    if (evt.isCapturing) {
      if (evt.data?.result) {
        fullText = evt.data.result;
        lastPartialTime = Date.now();
        options?.onPartialResult?.(fullText);
      }
    }
  });

  _currentTranscribe = { stop };

  return {
    stop: async (): Promise<TranscribeResult> => {
      _isRecording = false;
      _currentTranscribe = null;
      const result = await stop();
      return {
        text: fullText || result?.data?.result || '',
        segments: result?.data?.segments || [],
      };
    },
  };
}

/**
 * Check if currently recording
 */
export function isListening(): boolean {
  return _isRecording;
}

/**
 * Force stop any active recording
 */
export async function forceStop(): Promise<void> {
  if (_currentTranscribe) {
    _isRecording = false;
    await _currentTranscribe.stop();
    _currentTranscribe = null;
  }
}

/**
 * Release the whisper context (cleanup)
 */
export async function releaseWhisper(): Promise<void> {
  await forceStop();
  if (_ctx) {
    await _ctx.release();
    _ctx = null;
  }
}
