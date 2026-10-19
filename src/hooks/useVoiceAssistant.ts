import { useCallback, useEffect, useRef, useState } from 'react';
import { repositories } from '../db/repositories';
import { stamp, type AssistantMessage, type Recipe } from '../types/models';
import { memoryLabels } from '../services/memoryPolicy';
import {
  askAssistant,
  buildVocabulary,
  prepareAudio,
  speak,
  stopSpeaking,
  transcribe,
  type ChatResult,
  type VoiceAction,
  type VoiceContext,
} from '../services/voiceService';

export type AssistantStatus = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking';

export type VoiceAssistantOptions = {
  /** 取当前烹饪上下文（在做哪道菜、第几步） */
  getContext: () => Promise<VoiceContext>;
  /** 取当前正在做的那道菜，用于生成 ASR 热词 */
  getRecipe?: () => Recipe | undefined;
  /** 本地推荐：语音说"推荐几道辣菜"时走本地引擎，不让模型编菜名 */
  recommend?: (query: { flavors: string[]; exclude: string[] }) => Recipe[];
};

export type VoiceAssistantResult = {
  /** 用户原话 */
  question: string;
  /** 主回答 */
  answer: string;
  /** 可执行的动作清单 */
  actions: VoiceAction[];
  /** 推荐的菜谱（可点击） */
  recommended: Recipe[];
  /** 本轮是否在要推荐（用于空结果兜底提示） */
  wantRecommend: boolean;
  /** 本次新写入并生效的记忆（用于界面提示） */
  justRemembered: string[];
};

const MAX_RECORD_MS = 30_000;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

/** 浏览器是否支持录音（渲染期派生，不放进 state）。 */
function detectSupport(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  );
}

export function useVoiceAssistant({
  getContext,
  getRecipe,
  recommend,
}: VoiceAssistantOptions) {
  const [status, setStatus] = useState<AssistantStatus>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<VoiceAssistantResult | null>(null);
  const [history, setHistory] = useState<AssistantMessage[]>([]);
  const supported = detectSupport();

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);

  const refreshHistory = useCallback(async () => {
    try {
      const list = await repositories.assistantMessages.list(60);
      if (mounted.current) setHistory(list);
    } catch {
      // 历史读取失败不影响主流程
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // 放到下一个事件循环里读历史，避免在 effect 内同步 setState
    const kickoff = window.setTimeout(() => void refreshHistory(), 0);
    return () => {
      mounted.current = false;
      window.clearTimeout(kickoff);
      stopSpeaking();
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [refreshHistory]);

  /** 处理一次用户输入（语音或文字都走这里） */
  const handleText = useCallback(
    async (text: string, inputMode: 'voice' | 'text') => {
      const question = text.trim();
      if (!question) return;
      setError('');
      setStatus('thinking');
      try {
        const context = await getContext();
        const chat: ChatResult = await askAssistant(question, context);

        // 记忆写入：按 3 次阈值规则累积
        const memoryWrites: AssistantMessage['memoryWrites'] = [];
        const justRemembered: string[] = [];
        for (const item of chat.memory) {
          try {
            const applied = await repositories.preferenceMemory.applyEvidence({
              dimension: item.dimension as never,
              polarity: item.polarity,
              source: 'explicit',
              evidence: item.evidence || question,
            });
            memoryWrites.push({
              dimension: item.dimension,
              polarity: item.polarity,
              source: 'explicit',
            });
            if (applied.activated) {
              justRemembered.push(...memoryLabels([applied.next]));
            }
          } catch {
            // 单条记忆失败不阻断回答
          }
        }

        // 推荐意图：走本地引擎，模型只负责说理由。模型漏判时由 wantRecommend 兜底。
        let recommended: Recipe[] = [];
        if (chat.wantRecommend && recommend) {
          try {
            const query = chat.recommendQuery ?? { flavors: [], exclude: [] };
            recommended = recommend(query);
            if (!recommended.length && query.flavors.length) {
              recommended = recommend({ flavors: [], exclude: query.exclude });
            }
          } catch {
            recommended = [];
          }
        }

        const message: AssistantMessage = {
          ...stamp(),
          inputMode,
          userText: question,
          replyText: chat.answer,
          detail: chat.actions.map((action) =>
            [action.do, action.amount, action.when, action.check].filter(Boolean).join('｜'),
          ),
          intents: chat.intents,
          recipeName: context.recipeName,
          stepIndex: context.stepIndex,
          memoryWrites: memoryWrites?.length ? memoryWrites : undefined,
          recommendedRecipeIds: recommended.length ? recommended.map((r) => r.id) : undefined,
        };
        try {
          await repositories.assistantMessages.add(message);
        } catch {
          // 记录失败不影响回答展示
        }
        await refreshHistory();

        if (!mounted.current) return;
        setResult({
          question,
          answer: chat.answer,
          actions: chat.actions,
          recommended,
          wantRecommend: chat.wantRecommend,
          justRemembered,
        });
        setStatus('speaking');
        const spoken = [
          chat.answer,
          ...chat.actions.map((action) =>
            [action.do, action.amount, action.when].filter(Boolean).join('，'),
          ),
        ].join('。');
        speak(spoken, () => {
          if (mounted.current) setStatus('idle');
        });
      } catch (e) {
        if (!mounted.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('idle');
      }
    },
    [getContext, recommend, refreshHistory],
  );

  const stopRecording = useCallback(() => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (status !== 'idle' && status !== 'speaking') return;
    stopSpeaking();
    setError('');
    setResult(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      chunks.current = [];
      const mimeType = pickMimeType();
      const instance = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = instance;
      instance.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      instance.onstop = () => {
        const blob = new Blob(chunks.current, { type: instance.mimeType || 'audio/webm' });
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        void (async () => {
          if (!blob.size) {
            setError('没有录到声音，请再试一次');
            setStatus('idle');
            return;
          }
          setStatus('transcribing');
          try {
            const audio = await prepareAudio(blob);
            const asr = await transcribe(audio, buildVocabulary(getRecipe?.()));
            if (!mounted.current) return;
            await handleText(asr.text, 'voice');
          } catch (e) {
            if (!mounted.current) return;
            setError(e instanceof Error ? e.message : String(e));
            setStatus('idle');
          }
        })();
      };
      instance.start();
      setStatus('recording');
      timer.current = window.setTimeout(() => stopRecording(), MAX_RECORD_MS);
    } catch (e) {
      setError(
        e instanceof Error ? `无法使用麦克风：${e.message}` : '无法使用麦克风，请检查浏览器权限',
      );
      setStatus('idle');
    }
  }, [getRecipe, handleText, status, stopRecording]);

  const ask = useCallback(
    (text: string) => {
      stopSpeaking();
      void handleText(text, 'text');
    },
    [handleText],
  );

  const cancel = useCallback(() => {
    stopSpeaking();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    setStatus('idle');
  }, []);

  const clearResult = useCallback(() => setResult(null), []);

  return {
    status,
    error,
    result,
    history,
    supported,
    recording: status === 'recording',
    busy: status === 'transcribing' || status === 'thinking',
    startRecording,
    stopRecording,
    ask,
    cancel,
    clearResult,
    clearError: () => setError(''),
    refreshHistory,
  };
}
