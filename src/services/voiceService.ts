import type { Recipe } from '../types/models';

/** 语音识别结果 */
export type AsrResult = { text: string; duration?: number };

/** 对话结果（与 server/voiceGateway.ts 的 normalizeChatResult 对齐） */
export type ChatResult = {
  intents: string[];
  subtitle: string;
  detail: string[];
  memory: { dimension: string; polarity: number; source: 'explicit'; evidence: string }[];
  recommendQuery: { flavors: string[]; exclude: string[] } | null;
};

/** 当前烹饪上下文：让助手知道用户在做什么菜、第几步 */
export type VoiceContext = {
  recipeName?: string;
  stepIndex?: number;
  stepTotal?: number;
  stepInstruction?: string;
  check?: string;
  tip?: string;
  remedies?: Record<string, string>;
  tastePreferences?: string[];
  avoidIngredients?: string[];
};

export type PreparedAudio = { dataUrl: string; format: string; sampleRate: number };

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

/** 把 16-bit 单声道 PCM 打包成 WAV。 */
function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const samples = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const dataSize = samples.length * 2;
  const view = new DataView(new ArrayBuffer(44 + dataSize));
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 单声道
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return view.buffer;
}

function guessFormat(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('opus')) return 'opus';
  return 'wav';
}

/**
 * 把浏览器录到的音频整理成可直接提交的格式。
 *
 * 优先在本地转成 16 kHz 单声道 WAV —— 因为语音识别接口对 `format` 字段比较挑剔，
 * 而 WAV 是文档里明确支持的格式，能最大程度避免「格式不匹配」的 400 错误。
 * 如果浏览器不支持解码（极少见），退回原样上传并带上真实格式。
 */
export async function prepareAudio(blob: Blob, targetRate = 16000): Promise<PreparedAudio> {
  try {
    const raw = await blob.arrayBuffer();
    const audioContext = new AudioContext();
    try {
      const decoded = await audioContext.decodeAudioData(raw.slice(0));
      const frames = Math.max(1, Math.ceil(decoded.duration * targetRate));
      const offline = new OfflineAudioContext(1, frames, targetRate);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const rendered = await offline.startRendering();
      return {
        dataUrl: `data:audio/wav;base64,${arrayBufferToBase64(encodeWav(rendered))}`,
        format: 'wav',
        sampleRate: targetRate,
      };
    } finally {
      void audioContext.close();
    }
  } catch {
    const raw = await blob.arrayBuffer();
    const format = guessFormat(blob.type || '');
    return {
      dataUrl: `data:audio/${blob.type || 'wav'};base64,${arrayBufferToBase64(raw)}`,
      format,
      sampleRate: targetRate,
    };
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(value.error || `语音服务请求失败（${response.status}）`);
  return value;
}

/**
 * 提交音频做识别。
 * @param vocabulary 即时热词（词 -> 权重 1~5 或 50），用于提升菜名与调味料的识别率
 */
export async function transcribe(
  audio: PreparedAudio,
  vocabulary?: Record<string, number>,
): Promise<AsrResult> {
  return post<AsrResult>('/api/voice/asr', {
    audioDataUrl: audio.dataUrl,
    format: audio.format,
    sampleRate: audio.sampleRate,
    vocabulary,
    languageHints: ['zh'],
  });
}

/** 提交文本做意图判断与回答。 */
export async function askAssistant(text: string, context: VoiceContext): Promise<ChatResult> {
  return post<ChatResult>('/api/voice/chat', { text, context });
}

/** 从菜谱 + 步骤序号构造上下文。 */
export function buildContext(
  recipe: Recipe | undefined,
  stepIndex: number,
  extra: { remedies?: Record<string, string>; tastePreferences?: string[]; avoidIngredients?: string[] } = {},
): VoiceContext {
  const step = recipe?.steps[stepIndex];
  return {
    recipeName: recipe?.name,
    stepIndex,
    stepTotal: recipe?.steps.length,
    stepInstruction: step?.instruction,
    check: step?.check,
    tip: step?.tip,
    remedies: extra.remedies,
    tastePreferences: extra.tastePreferences,
    avoidIngredients: extra.avoidIngredients,
  };
}

/**
 * 生成即时热词表。
 *
 * 厨房场景里通用 ASR 最容易错的就是菜名、食材名和调味料名，
 * 用菜谱库里的词做热词可以显著提升识别率。
 */
export function buildVocabulary(recipe: Recipe | undefined, limit = 60): Record<string, number> {
  const words = new Set<string>(['知味咪']);
  const add = (value?: string) => {
    const word = value?.trim();
    if (word && word.length >= 2 && word.length <= 12) words.add(word);
  };
  add(recipe?.name);
  for (const cuisine of recipe?.cuisines ?? []) add(cuisine);
  for (const ingredient of recipe?.ingredients ?? []) add(ingredient.name);
  // 常见调味料与烹饪术语，模型通用词表里不一定准
  for (const term of [
    '生抽', '老抽', '蚝油', '豆瓣酱', '料酒', '花椒', '八角', '蒜末', '姜片', '葱花',
    '断生', '煸炒', '收汁', '勾芡', '焯水', '爆香', '七分熟',
  ]) {
    words.add(term);
  }
  const vocabulary: Record<string, number> = {};
  let count = 0;
  for (const word of words) {
    if (count >= limit) break;
    vocabulary[word] = word === '知味咪' ? 50 : 3;
    count += 1;
  }
  return vocabulary;
}

/** 朗读文本；不支持时静默跳过（不影响字幕显示）。 */
export function speak(text: string, onEnd?: () => void): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 1.05;
  utterance.pitch = 1;
  const voice = synth.getVoices().find((item) => item.lang.startsWith('zh'));
  if (voice) utterance.voice = voice;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
