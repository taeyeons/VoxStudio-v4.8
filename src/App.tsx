// src/App.tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Dexie, { type EntityTable } from 'dexie';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { 
  Upload, Settings, Mic, Download, Copy, Trash2, 
  Loader2, Sparkles, Zap, Users, PlayCircle, CheckCircle2, 
  AlertCircle, BookOpen, Plus, LayoutGrid, ChevronRight, 
  Eye, EyeOff, Sun, Moon, Leaf, FolderOpen, Save, FileJson, 
  Check, Pencil, Volume2, Square, Wand2, XOctagon, X, 
  ShieldAlert, Activity, Play, Pause, MessageSquare, 
  AlignJustify, History, Eraser, Maximize, Minimize, Headphones, Clock, Presentation, Music, Search, Command,
  Undo2, Redo2, ReplaceAll, FileSpreadsheet, Bot, FastForward
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';

import { useProjectStore } from './store/useProjectStore';
import { Project, Chapter, Snapshot, ScriptElement, Theme, FontSize, Character } from './types';
import ScriptCard from './components/studio/ScriptCard';

// ============================================================================
// 0. Edge TTS 内置优选音色库 (用于 AI 智能选角)
// ============================================================================
const EDGE_VOICES_CATALOG = [
  { id: "zh-CN-XiaoxiaoNeural", desc: "女，通用旁白，温柔" },
  { id: "zh-CN-YunxiNeural", desc: "男，阳光青年，通用男主" },
  { id: "zh-CN-XiaoyiNeural", desc: "女，萝莉/可爱/小女孩" },
  { id: "zh-CN-XiaomoNeural", desc: "女，成熟御姐/大青衣" },
  { id: "zh-CN-XiaoruiNeural", desc: "女，知性/稳重/中年女" },
  { id: "zh-CN-YunjianNeural", desc: "男，成熟稳重/大叔/男配" },
  { id: "zh-CN-YunzeNeural", desc: "男，苍老/老爷爷/反派" },
  { id: "zh-CN-liaoning-XiaobeiNeural", desc: "男，东北话/搞笑/接地气" },
  { id: "zh-TW-HsiaoChenNeural", desc: "女，台湾腔/机车/软萌" }
];

// 简单的哈希用于生成渐变头像和缓存Key
const getHashStr = (str: string) => {
  let hash = 0; 
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  }
  return hash.toString(16);
};

const generateGradient = (name: string) => {
  const c1 = `hsl(${Math.abs(getHashStr(name).charCodeAt(0)) % 360}, 70%, 60%)`;
  const c2 = `hsl(${Math.abs(getHashStr(name).charCodeAt(1) || 50) % 360}, 70%, 40%)`;
  return `linear-gradient(135deg, ${c1}, ${c2})`;
};

// ============================================================================
// 1. Dexie.js 数据库服务 (主项目 + 独立的 TTS 高速缓存)
// ============================================================================
const db = new Dexie('VoxStudioDatabase') as Dexie & { projects: EntityTable<Project, 'id'> };
db.version(1).stores({ projects: 'id, lastModified' });

const audioDb = new Dexie('VoxAudioCache') as Dexie & { cache: EntityTable<{ hash: string, blob: Blob, timestamp: number }, 'hash'> };
audioDb.version(1).stores({ cache: 'hash, timestamp' });

const saveToDB = async (project: Project) => { 
  await db.projects.put(project); 
  return true; 
};

const loadAllFromDB = async (): Promise<Project[]> => { 
  return await db.projects.orderBy('lastModified').reverse().toArray(); 
};

// ============================================================================
// 2. AI 服务引擎
// ============================================================================
const getAiConfig = () => {
  const format = localStorage.getItem('vox_api_format') || 'gemini';
  const customKey = localStorage.getItem('vox_api_key') || undefined;
  const customUrl = localStorage.getItem('vox_base_url') || undefined;
  return { format, customKey, customUrl };
};

const handleAiError = (e: any) => {
  console.error("AI API Error:", e);
  if (e.message?.includes('503') || e.status === 503) {
    throw new Error("503 错误：AI模型当前处于高负载状态或暂时不可用，请稍后重试。");
  } else if (e.message?.includes('401') || e.status === 401) {
    throw new Error("401 错误：API Key 无效或已过期，请重新配置。");
  } else if (e.message?.includes('fetch') || e.name === 'TypeError') {
    throw new Error("网络请求失败 (Fetch Error): 请检查网络连接、代理，或跨域配置。");
  }
  throw new Error(e.message || "未知的 AI 生成错误");
};

const generateAiContent = async (options: { model: string, prompt: string, systemInstruction?: string, jsonMode?: boolean }) => {
  const { format, customKey, customUrl } = getAiConfig();
  try {
    if (format === 'openai' || customUrl?.includes('deepseek') || customUrl?.includes('aliyuncs') || customUrl?.includes('dashscope') || customUrl?.includes('volcengine')) {
      const apiKey = customKey || process.env.GEMINI_API_KEY || ""; 
      const openai = new OpenAI({ apiKey, baseURL: customUrl, dangerouslyAllowBrowser: true });
      const messages: any[] = [];
      if (options.systemInstruction) {
        messages.push({ role: 'system', content: options.systemInstruction });
      }
      messages.push({ role: 'user', content: options.prompt });
      
      const completion = await openai.chat.completions.create({
        model: options.model, 
        messages,
        response_format: options.jsonMode ? { type: "json_object" } : undefined,
        temperature: options.jsonMode ? 0.1 : 0.7,
      });
      return completion.choices[0].message.content;
    } else {
      const ai = new GoogleGenAI({ apiKey: customKey || process.env.GEMINI_API_KEY, httpOptions: customUrl ? { baseUrl: customUrl } : undefined });
      const response = await ai.models.generateContent({
        model: options.model,
        contents: [{ role: "user", parts: [{ text: options.prompt }] }],
        config: { 
          systemInstruction: options.systemInstruction, 
          temperature: options.jsonMode ? 0.1 : 0.7, 
          responseMimeType: options.jsonMode ? "application/json" : undefined 
        }
      });
      return response.text;
    }
  } catch (e: any) { 
    handleAiError(e); 
  }
};

const generateAiStream = async function* (options: { model: string, prompt: string, systemInstruction?: string, signal?: AbortSignal }) {
  const { format, customKey, customUrl } = getAiConfig();
  try {
    if (format === 'openai' || customUrl?.includes('deepseek') || customUrl?.includes('aliyuncs') || customUrl?.includes('dashscope') || customUrl?.includes('volcengine')) {
      const apiKey = customKey || process.env.GEMINI_API_KEY || ""; 
      const openai = new OpenAI({ apiKey, baseURL: customUrl, dangerouslyAllowBrowser: true });
      const messages: any[] = [];
      if (options.systemInstruction) {
        messages.push({ role: 'system', content: options.systemInstruction });
      }
      messages.push({ role: 'user', content: options.prompt });
      
      const stream = await openai.chat.completions.create({ 
        model: options.model, 
        messages, 
        stream: true, 
        temperature: 0.7 
      }, { signal: options.signal });
      
      for await (const chunk of stream) {
        yield chunk.choices[0]?.delta?.content || "";
      }
    } else {
      const ai = new GoogleGenAI({ apiKey: customKey || process.env.GEMINI_API_KEY, httpOptions: customUrl ? { baseUrl: customUrl } : undefined });
      const result = await ai.models.generateContentStream({
        model: options.model,
        contents: [{ role: "user", parts: [{ text: options.prompt }] }],
        config: { systemInstruction: options.systemInstruction, temperature: 0.7 }
      });
      for await (const chunk of result) {
        if (options.signal?.aborted) throw new Error("AbortError");
        yield chunk.text;
      }
    }
  } catch (e: any) {
    if (e.message === "AbortError" || e.name === "AbortError") throw e; 
    handleAiError(e);
  }
};

const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels; 
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new ArrayBuffer(length); 
  const view = new DataView(out); 
  const channels = [];
  let sampleRate = buffer.sampleRate; 
  let offset = 0; 
  let pos = 0;
  
  function setUint16(data: number) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data: number) { view.setUint32(pos, data, true); pos += 4; }
  
  setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); setUint32(0x20746d66); 
  setUint32(16); setUint16(1); setUint16(numOfChan); setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan); setUint16(numOfChan * 2); setUint16(16);
  setUint32(0x61746164); setUint32(length - pos - 4);
  
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }
  
  while (offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true); 
      pos += 2;
    }
    offset++;
  }
  return new Blob([view], { type: "audio/wav" });
};

const SENSITIVE_WORDS = ["血腥", "杀戮", "自杀", "暴政", "毒品", "低俗", "色情"];
const COLOR_POOL = ["bg-sky-500", "bg-pink-500", "bg-purple-500", "bg-indigo-500", "bg-rose-500", "bg-emerald-500", "bg-teal-500", "bg-orange-500", "bg-cyan-500"];

export default function App() {
  const { 
    projectId, projectName, chapters, currentChapterId, characters, prodStyle, readingSpeed, 
    theme, workspaceFontSize, viewMode, zenMode, globalPronunciations,
    setProjectId, setProjectName, setChapters, setCurrentChapterId, setCharacters, setProdStyle, setReadingSpeed,
    setTheme, setWorkspaceFontSize, setViewMode, setZenMode, setGlobalPronunciations,
    updateCurrentChapter, updateScriptElement, reorderScriptElements, deleteScriptElement, batchReplaceContent
  } = useProjectStore();

  const pastStates = useStore(useProjectStore.temporal, (state) => state.pastStates);
  const futureStates = useStore(useProjectStore.temporal, (state) => state.futureStates);
  const undo = useStore(useProjectStore.temporal, (state) => state.undo);
  const redo = useStore(useProjectStore.temporal, (state) => state.redo);

  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  const [isDBLoaded, setIsDBLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<"book" | "cast" | "studio">("book");
  const [error, setError] = useState<string | null>(null);
  const [showSaveToast, setShowSaveToast] = useState(false);
  
  const [chapterSnapshots, setChapterSnapshots] = useState<Record<string, Snapshot[]>>({});
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [aiThinkingProcess, setAiThinkingProcess] = useState<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isBatching, setIsBatching] = useState(false);
  const isBatchingRef = useRef<boolean>(false);

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'txt' | 'markdown' | 'word' | 'excel' | 'audio'>('txt');
  const [exportScope, setExportScope] = useState<'single' | 'all'>('single');
  const [audioExportProgress, setAudioExportProgress] = useState<{current: number, total: number, status: string} | null>(null);
  
  const [cmdKOpen, setCmdKOpen] = useState(false);
  const [cmdKMode, setCmdKMode] = useState<'commands' | 'replace'>('commands');
  const [cmdKSearch, setCmdKSearch] = useState("");
  const [replaceTarget, setReplaceTarget] = useState("");
  const cmdKInputRef = useRef<HTMLInputElement>(null);

  const [editingVaultProjectId, setEditingVaultProjectId] = useState<string | null>(null);
  const [vaultProjectName, setVaultProjectName] = useState("");

  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editingSidebarChapterId, setEditingSidebarChapterId] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [inlineRewriteId, setInlineRewriteId] = useState<string | null>(null);
  const [inlineRewritePrompt, setInlineRewritePrompt] = useState("");
  const [pendingDiffs, setPendingDiffs] = useState<Record<string, ScriptElement>>({});
  const [showDirectorNote, setShowDirectorNote] = useState(false);
  const [newGlobalWord, setNewGlobalWord] = useState("");
  const [newGlobalPinyin, setNewGlobalPinyin] = useState("");

  const [showSource, setShowSource] = useState(true);
  const [syncScroll, setSyncScroll] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isResizing, setIsResizing] = useState(false);
  const [sourceWidthRatio, setSourceWidthRatio] = useState(38);
  const [isDraggingSplitter, setIsDraggingSplitter] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  // === 全局播放台与可视化核心 ===
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [auditioningId, setAuditioningId] = useState<string | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const isAutoPlayingRef = useRef<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const currentChapter = chapters.find(c => c.id === currentChapterId) || chapters[0];
  const [complianceIssues, setComplianceIssues] = useState<Record<string, string[]>>({});

  const sourceScrollRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollLeaderRef = useRef<'source' | 'script' | null>(null); 
  const [hoveredCardIndex, setHoveredCardIndex] = useState<number | null>(null);

  const workspaceContainerRef = useRef<HTMLDivElement>(null);
  const svgPathRef = useRef<SVGPathElement>(null);
  const [ambientGlow, setAmbientGlow] = useState<string>("transparent");

  const [localApiKey, setLocalApiKey] = useState(() => localStorage.getItem('vox_api_key') || "");
  const [localBaseUrl, setLocalBaseUrl] = useState(() => localStorage.getItem('vox_base_url') || "");
  const [localApiFormat, setLocalApiFormat] = useState(() => localStorage.getItem('vox_api_format') || "gemini");
  const [localCustomModel, setLocalCustomModel] = useState(() => localStorage.getItem('vox_custom_model') || "");
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState(() => localStorage.getItem('vox_elevenlabs_key') || "");
  const [edgeTtsProxyUrl, setEdgeTtsProxyUrl] = useState(() => localStorage.getItem('vox_edgetts_proxy') || "");
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('vox_selected_model') || "gemini-3.1-flash-lite-preview");

  useEffect(() => localStorage.setItem('vox_api_key', localApiKey), [localApiKey]);
  useEffect(() => localStorage.setItem('vox_base_url', localBaseUrl), [localBaseUrl]);
  useEffect(() => localStorage.setItem('vox_api_format', localApiFormat), [localApiFormat]);
  useEffect(() => localStorage.setItem('vox_custom_model', localCustomModel), [localCustomModel]);
  useEffect(() => localStorage.setItem('vox_elevenlabs_key', elevenLabsApiKey), [elevenLabsApiKey]);
  useEffect(() => localStorage.setItem('vox_edgetts_proxy', edgeTtsProxyUrl), [edgeTtsProxyUrl]);
  useEffect(() => localStorage.setItem('vox_selected_model', selectedModel), [selectedModel]);

  // 连线特效
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const updatePath = (time: number) => {
      if (time - lastTime < 33) {
         animationFrameId = requestAnimationFrame(updatePath); return;
      }
      lastTime = time;

      if (!showSource || (viewMode !== 'standard' && viewMode !== 'chat') || !svgPathRef.current || !workspaceContainerRef.current || isDraggingSplitter) {
        if (svgPathRef.current) svgPathRef.current.style.opacity = '0';
        animationFrameId = requestAnimationFrame(updatePath); 
        return;
      }
      
      const containerRect = workspaceContainerRef.current.getBoundingClientRect();
      const activePara = sourceScrollRef.current?.querySelector('p.active');
      const activeCard = document.querySelector('.script-card.active-card');

      if (activePara && activeCard && (hoveredCardIndex !== null || playingId !== null)) {
        const pRect = activePara.getBoundingClientRect(); 
        const cRect = activeCard.getBoundingClientRect();
        
        const startX = pRect.right - containerRect.left; 
        const startY = pRect.top + pRect.height / 2 - containerRect.top;
        const endX = cRect.left - containerRect.left; 
        const endY = cRect.top + cRect.height / 2 - containerRect.top;
        
        const cp1X = startX + 50; 
        const cp1Y = startY; 
        const cp2X = endX - 50; 
        const cp2Y = endY;

        svgPathRef.current.setAttribute('d', `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`);
        svgPathRef.current.style.opacity = '1';
        const strokeColor = theme === 'light' ? 'rgba(14, 165, 233, 0.4)' : 'rgba(56, 189, 248, 0.4)';
        svgPathRef.current.setAttribute('stroke', strokeColor);
      } else {
        svgPathRef.current.style.opacity = '0';
      }
      animationFrameId = requestAnimationFrame(updatePath);
    };
    
    animationFrameId = requestAnimationFrame(updatePath);
    return () => cancelAnimationFrame(animationFrameId);
  }, [showSource, viewMode, theme, playingId, hoveredCardIndex, isDraggingSplitter]);

  // 频域可视化循环绘制
  useEffect(() => {
    let animId: number;
    const draw = () => {
      animId = requestAnimationFrame(draw);
      if (!analyserRef.current || !visualizerCanvasRef.current) return;
      const canvas = visualizerCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight; 
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 255 * canvas.height;
        ctx.fillStyle = theme === 'light' ? `rgba(14, 165, 233, ${dataArray[i]/255})` : `rgba(56, 189, 248, ${dataArray[i]/255})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, [theme]);

  const saveCurrentProject = useCallback(() => {
    const currentProject: Project = { 
      id: projectId, 
      name: projectName, 
      lastModified: Date.now(), 
      chapters, 
      characters, 
      prodStyle, 
      readingSpeed, 
      theme, 
      globalPronunciations 
    };
    setSavedProjects(prev => {
      const exists = prev.find(p => p.id === projectId);
      return exists ? prev.map(p => p.id === projectId ? currentProject : p) : [currentProject, ...prev];
    });
    saveToDB(currentProject).catch(e => console.error("Dexie Save Error:", e));
    if (!isBatchingRef.current) {
      setShowSaveToast(true); 
      setTimeout(() => setShowSaveToast(false), 2000);
    }
  }, [projectId, projectName, chapters, characters, prodStyle, readingSpeed, theme, globalPronunciations]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const stored = await loadAllFromDB();
        if (stored && stored.length > 0) setSavedProjects(stored);
      } catch (e) {
        console.warn("Dexie load failed, checking localStorage fallback", e);
        const oldStorage = localStorage.getItem("vox_studio_projects");
        if (oldStorage) {
          try {
            const parsed = JSON.parse(oldStorage);
            setSavedProjects(parsed);
            parsed.forEach((p: Project) => saveToDB(p));
            localStorage.removeItem("vox_studio_projects");
          } catch(err) {}
        }
      } finally { 
        setIsDBLoaded(true); 
      }
    };
    loadData();
  }, []);

  const emotionData = useMemo(() => {
    if (!currentChapter.parsedElements.length) return [];
    return currentChapter.parsedElements.map(el => {
      let score = 20; 
      let color = theme === 'light' ? "bg-slate-300" : "bg-slate-700"; 
      let glow = "transparent";
      
      if (el.type === 'dialogue' || el.type === 'narration') {
         const m = el.meta || "";
         if (m.match(/怒|吼|喊|急|叫|惊|恐|爆|震|激|狠|咒|冷笑|愤怒/)) { 
           score = 90; color = "bg-red-500"; glow = "rgba(239, 68, 68, 0.08)"; 
         } else if (m.match(/笑|喜|悦|乐|柔|轻|慰|温|调侃|开心/)) { 
           score = 60; color = "bg-emerald-400"; glow = "rgba(16, 185, 129, 0.08)"; 
         } else if (m.match(/悲|泣|哭|沉|落|叹|哀|冷|冷漠|伤心/)) { 
           score = 40; color = "bg-indigo-400"; glow = "rgba(99, 102, 241, 0.08)"; 
         } else { 
           score = 30; color = "bg-sky-400"; glow = "rgba(14, 165, 233, 0.05)"; 
         }
      }
      return { id: el.id, score, color, glow };
    });
  }, [currentChapter.parsedElements, theme]);

  const createSnapshot = (summaryText: string) => {
    const snap: Snapshot = { 
      id: `snap-${Date.now()}`, 
      timestamp: Date.now(), 
      summary: summaryText, 
      chapterData: JSON.parse(JSON.stringify(currentChapter)) 
    };
    setChapterSnapshots(prev => { 
      const existing = prev[currentChapterId] || []; 
      return { ...prev, [currentChapterId]: [snap, ...existing].slice(0, 5) }; 
    });
  };

  const restoreSnapshot = (snap: Snapshot) => {
    setChapters(prev => prev.map(c => c.id === currentChapterId ? snap.chapterData : c));
    setShowSnapshotModal(false); 
    setShowSaveToast(true); 
    setTimeout(() => setShowSaveToast(false), 2000);
  };

  const cleanNovelText = () => {
    let txt = currentChapter.novelText
      .replace(/\n\s*\n/g, '\n')
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      .replace(/,/g, '，')
      .replace(/\?/g, '？')
      .replace(/!/g, '！');
    updateCurrentChapter({ novelText: txt }); 
    setShowSaveToast(true); 
    setTimeout(() => setShowSaveToast(false), 2000);
  };

  const handleSplitImport = (fullText: string) => { 
    const splitRegex = /\n?\s*(第[一二三四五六七八九十百千万0-9]+[章节回卷节][^\n]{0,20}|楔子|序[章幕]|前言|后记)/g;
    const matches = Array.from(fullText.matchAll(splitRegex));
    if (matches.length <= 1) { 
      updateCurrentChapter({ novelText: fullText }); 
      return; 
    }
    const newChapters: Chapter[] = [];
    for (let i = 0; i < matches.length; i++) {
        const title = matches[i][0].trim();
        const startIdx = matches[i].index! + matches[i][0].length;
        const endIdx = (i + 1 < matches.length) ? matches[i+1].index : fullText.length;
        newChapters.push({ 
          id: `ch-${Date.now()}-${i}`, 
          title, 
          novelText: fullText.slice(startIdx, endIdx).trim(), 
          scriptText: "", 
          parsedElements: [] 
        });
    }
    setChapters(newChapters); 
    setCurrentChapterId(newChapters[0].id);
  };

  const applyPronunciations = (text: string, localDict?: Record<string, string>) => {
    let cleanText = text;
    if (globalPronunciations) {
      Object.entries(globalPronunciations).forEach(([word, pinyin]) => { 
        cleanText = cleanText.replace(new RegExp(word, 'g'), pinyin); 
      });
    }
    if (localDict) {
      Object.entries(localDict).forEach(([word, pinyin]) => { 
        cleanText = cleanText.replace(new RegExp(word, 'g'), pinyin); 
      });
    }
    return cleanText;
  };

  useEffect(() => {
    if (isAutoPlaying && currentChapter.bgmUrl) {
      if (!bgmAudioRef.current) {
        bgmAudioRef.current = new Audio(currentChapter.bgmUrl);
      } else if (bgmAudioRef.current.src !== currentChapter.bgmUrl) {
        bgmAudioRef.current.src = currentChapter.bgmUrl;
      }
      bgmAudioRef.current.loop = true; 
      bgmAudioRef.current.volume = 0.2;
      bgmAudioRef.current.play().catch(e => console.log("BGM Play Error:", e));
    } else {
      if (bgmAudioRef.current) {
        bgmAudioRef.current.pause();
      }
    }
  }, [isAutoPlaying, currentChapter.bgmUrl]);

  // ============================================================================
  // 高级特性：音频处理与播放逻辑 (含 IndexedDB 缓存 & Visualizer)
  // ============================================================================
  const setupAudioContext = (audio: HTMLAudioElement) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 64;
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    if (audioSourceNodeRef.current) {
      audioSourceNodeRef.current.disconnect();
    }
    audioSourceNodeRef.current = audioCtxRef.current.createMediaElementSource(audio);
    audioSourceNodeRef.current.connect(analyserRef.current!);
    analyserRef.current!.connect(audioCtxRef.current.destination);
  };

  const getAudioBlobFromTTS = async (cleanText: string, voiceId: string, rate: number): Promise<{blob: Blob, hash: string}> => {
    const isEleven = elevenLabsApiKey && !voiceId.includes("Neural");
    const reqBody = isEleven ? { text: cleanText, model_id: "eleven_multilingual_v2" } : { text: cleanText, voice: voiceId };
    const hash = getHashStr(JSON.stringify(reqBody) + rate.toString());
    
    const cached = await audioDb.cache.get(hash);
    if (cached) return { blob: cached.blob, hash };

    let res: Response;
    if (isEleven) {
      res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST', 
        headers: { 'xi-api-key': elevenLabsApiKey, 'Content-Type': 'application/json' }, 
        body: JSON.stringify(reqBody)
      });
    } else {
      const baseUrl = edgeTtsProxyUrl.endsWith('/api/tts') ? edgeTtsProxyUrl : `${edgeTtsProxyUrl.replace(/\/$/, '')}/api/tts`;
      res = await fetch(baseUrl, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(reqBody) 
      });
    }
    
    if (!res.ok) throw new Error(`TTS API Error: Status ${res.status}`);
    
    const arrayBuffer = await res.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: res.headers.get('content-type') || 'audio/mpeg' });
    
    return { blob, hash };
  };

  const playAudioAsync = (text: string, voiceId: string | undefined, elId: string, elIndex: number): Promise<void> => {
    return new Promise(async (resolve) => {
      if (!isAutoPlayingRef.current && playingId === null && !playingId) { resolve(); return; }
      
      const element = currentChapter.parsedElements[elIndex];
      const audioConfig = element?.audioConfig;
      setPlayingId(elId);
      
      if (emotionData[elIndex]) {
        setAmbientGlow(emotionData[elIndex].glow);
      }

      let cleanText = (text || "").replace(/[【】（）()\[\]]/g, '').trim();
      cleanText = applyPronunciations(cleanText, element?.pronunciations);

      if (virtuosoRef.current) { 
        virtuosoRef.current.scrollToIndex({ index: elIndex, align: 'center', behavior: 'smooth' }); 
        applyHighlights(elIndex); 
      }

      if (!cleanText) { 
        setPlayingId(null); 
        setAmbientGlow("transparent"); 
        resolve(); 
        return; 
      }
      
      if (audioConfig?.pauseBefore) {
        await new Promise(r => setTimeout(r, audioConfig.pauseBefore));
      }

      const onComplete = async () => {
        if (audioConfig?.pauseAfter) {
          await new Promise(r => setTimeout(r, audioConfig.pauseAfter));
        }
        setPlayingId(null); 
        setAmbientGlow("transparent"); 
        resolve();
      };

      let targetVoice = voiceId;
      if (!targetVoice) {
         // Fix: Proper fallback mapping for narration or dialog without specific voiceId
         const defaultChar = element.type === 'narration' 
            ? characters.find(c => c.id === 'nar' || c.name === '旁白') 
            : null;
         targetVoice = defaultChar?.voiceId || (element.type === 'narration' ? 'zh-CN-XiaoxiaoNeural' : 'zh-CN-YunxiNeural');
      }

      if (elevenLabsApiKey || edgeTtsProxyUrl) {
        try {
          const { blob, hash } = await getAudioBlobFromTTS(cleanText, targetVoice, audioConfig?.rate || 1.0);
          
          // 在播放时直接利用浏览器内置解码能力
          const audio = new Audio(URL.createObjectURL(blob));
          audio.crossOrigin = "anonymous";
          if (audioConfig?.rate) audio.playbackRate = audioConfig.rate;
          
          audioRef.current = audio;
          setupAudioContext(audio);
          
          audio.onended = onComplete; 
          audio.onerror = onComplete;
          
          if (isAutoPlayingRef.current || playingId) {
            await audio.play(); 
            // 播放成功后再写入缓存，防止坏死缓存
            audioDb.cache.put({ hash, blob, timestamp: Date.now() }).catch(e => console.warn(e));
          } else {
            onComplete();
          }
        } catch (e: any) {
          console.warn("TTS Error, fallback to browser:", e);
          setError(`音频拉取失败: ${e.message}。请检查音色ID(${targetVoice})是否合法，或代理状态。已自动降级为浏览器机械音。`);
          fallbackBrowserTTS(cleanText, elId, audioConfig, onComplete);
        }
      } else {
        fallbackBrowserTTS(cleanText, elId, audioConfig, onComplete);
      }
    });
  };

  const playAudition = async (char: Character) => {
    if (auditioningId === char.id) {
      stopAllAudio();
      setAuditioningId(null);
      return;
    }
    stopAllAudio();
    setAuditioningId(char.id);
    try {
      const safeDesc = char.description || "";
      const safeTone = char.tone || "";
      const text = `你好，我是${char.name || '未知角色'}。${safeTone}。${safeDesc.slice(0, 15)}`;
      const voiceId = char.voiceId || (char.gender === '女' ? 'zh-CN-XiaoxiaoNeural' : 'zh-CN-YunxiNeural');
      
      if (elevenLabsApiKey || edgeTtsProxyUrl) {
        const { blob } = await getAudioBlobFromTTS(text, voiceId, 1.0);
        const audio = new Audio(URL.createObjectURL(blob));
        audioRef.current = audio;
        setupAudioContext(audio);
        audio.onended = () => setAuditioningId(null);
        audio.onerror = () => {
           setError(`试听音频解码失败，请检查音色ID: ${voiceId}`);
           setAuditioningId(null);
        };
        await audio.play();
      } else {
        fallbackBrowserTTS(text, char.id, {}, () => setAuditioningId(null));
      }
    } catch (e: any) {
      console.error("Audition Error:", e);
      setError(`试听请求失败: ${e.message}。请检查音色ID是否合法或代理配置。`);
      setAuditioningId(null);
    }
  };

  const fallbackBrowserTTS = (text: string, id: string, config: any, resolve: () => void) => {
    if (!('speechSynthesis' in window)) { resolve(); return; }
    window.speechSynthesis.cancel();
    
    const msg = new SpeechSynthesisUtterance(text);
    utteranceRef.current = msg; 
    const globalRate = readingSpeed / 200;
    msg.rate = config?.rate ? config.rate * globalRate : globalRate; 
    msg.pitch = config?.pitch || 1.0;
    msg.onend = resolve; 
    msg.onerror = resolve;
    
    if (isAutoPlayingRef.current || playingId || auditioningId) {
      window.speechSynthesis.speak(msg); 
    } else {
      resolve();
    }
  };

  const stopAllAudio = () => {
    setIsAutoPlaying(false); 
    isAutoPlayingRef.current = false; 
    setPlayingId(null); 
    setAuditioningId(null);
    setAmbientGlow("transparent");
    if (audioRef.current) { 
      audioRef.current.pause(); 
      audioRef.current = null; 
    }
    window.speechSynthesis.cancel();
  };

  const startContinuousPlay = async () => {
    if (isAutoPlayingRef.current) { 
      stopAllAudio(); 
      return; 
    }
    
    window.speechSynthesis.cancel();
    setIsAutoPlaying(true); 
    isAutoPlayingRef.current = true;
    let startIndex = hoveredCardIndex !== null ? hoveredCardIndex : 0;
    
    const elements = currentChapter.parsedElements;
    for (let i = startIndex; i < elements.length; i++) {
      if (!isAutoPlayingRef.current) break; 
      
      const el = elements[i];
      if (el.type === 'sound_effect') {
        setPlayingId(el.id); 
        if (emotionData[i]) setAmbientGlow(emotionData[i].glow);
        if (virtuosoRef.current) { 
          virtuosoRef.current.scrollToIndex({ index: i, align: 'center', behavior: 'smooth' }); 
          applyHighlights(i); 
        }
        await new Promise(r => setTimeout(r, el.audioConfig?.pauseAfter || 1500));
        setPlayingId(null); 
        setAmbientGlow("transparent"); 
        continue;
      }
      
      // Fix: Proper speaker mapping for Narration
      let char = characters.find(c => c.name === el.speaker);
      if (!char && (el.type === 'narration' || el.speaker === '旁白')) {
         char = characters.find(c => c.id === 'nar' || c.name === '旁白');
      }

      await playAudioAsync(el.content, char?.voiceId, el.id, i);
      
      if (!el.audioConfig?.pauseAfter) {
        await new Promise(r => setTimeout(r, 400));
      }
    }
    
    setIsAutoPlaying(false); 
    isAutoPlayingRef.current = false; 
    setPlayingId(null); 
    setAmbientGlow("transparent");
  };

  const handleSingleTTSPlay = useCallback((text: string, id: string, speakerName?: string, index: number = 0) => {
    if (playingId === id || isAutoPlayingRef.current) { 
      stopAllAudio(); 
      return; 
    }
    stopAllAudio(); 
    setPlayingId(id);
    
    // Fix: Proper speaker mapping for Narration
    let char = characters.find(c => c.name === speakerName);
    if (!char && (!speakerName || speakerName === '旁白')) {
       char = characters.find(c => c.id === 'nar' || c.name === '旁白');
    }
    
    playAudioAsync(text, char?.voiceId, id, index);
  }, [playingId, characters, edgeTtsProxyUrl]);

  // ============================================================================
  // 高级特性：Offline Audio Mixdown with Ducking
  // ============================================================================
  const exportAudioMixdown = async () => {
    if (!elevenLabsApiKey && !edgeTtsProxyUrl) { 
      setError("混音导出需要配置 Edge TTS 代理或 ElevenLabs API Key。"); 
      return; 
    }
    
    const elements = exportScope === 'single' ? currentChapter.parsedElements : chapters.flatMap(c => c.parsedElements);
    const audioElements = elements.filter(e => e.type !== 'sound_effect' && e.content.trim());
    if (audioElements.length === 0) { 
      setError("没有可导出的语音节点"); 
      return; 
    }

    setIsProcessing(true); 
    setAudioExportProgress({ current: 0, total: audioElements.length, status: '提取/下载音频切片...' });
    
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const sampleRate = audioContext.sampleRate;
      const audioBuffers: { buffer: AudioBuffer, startTime: number, rate: number }[] = [];
      let currentTime = 0;

      for (let i = 0; i < audioElements.length; i++) {
        if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0)); // Yield thread
        
        const el = audioElements[i];
        
        // Fix: Proper mapping for Narration in Export Mixdown
        let char = characters.find(c => c.name === el.speaker);
        if (!char && (el.type === 'narration' || el.speaker === '旁白')) {
           char = characters.find(c => c.id === 'nar' || c.name === '旁白');
        }

        let voiceId = char?.voiceId;
        if (!voiceId) voiceId = el.type === 'narration' ? 'zh-CN-XiaoxiaoNeural' : 'zh-CN-YunxiNeural';

        setAudioExportProgress({ current: i + 1, total: audioElements.length, status: `解析轨道: [${el.speaker || '旁白'}]` });

        let cleanText = el.content.replace(/[【】（）()\[\]]/g, '').trim();
        cleanText = applyPronunciations(cleanText, el.pronunciations);

        const rate = el.audioConfig?.rate || 1.0;
        
        try {
           const { blob, hash } = await getAudioBlobFromTTS(cleanText, voiceId, rate);
           const arrayBuffer = await blob.arrayBuffer();
           const buffer = await audioContext.decodeAudioData(arrayBuffer);
           
           // 解码成功才缓存
           audioDb.cache.put({ hash, blob, timestamp: Date.now() }).catch(e => console.warn(e));

           const pauseBefore = (el.audioConfig?.pauseBefore || 0) / 1000;
           const pauseAfter = (el.audioConfig?.pauseAfter || 400) / 1000;

           currentTime += pauseBefore;
           audioBuffers.push({ buffer, startTime: currentTime, rate });
           currentTime += (buffer.duration / rate) + pauseAfter;
        } catch (decodeErr) {
           console.error("Decode Error for node", i, decodeErr);
           // 解码失败时删除可能存在的坏死缓存并跳过本节点，不打断整体渲染
           const reqBody = elevenLabsApiKey && !voiceId.includes("Neural") ? { text: cleanText, model_id: "eleven_multilingual_v2" } : { text: cleanText, voice: voiceId };
           const hash = getHashStr(JSON.stringify(reqBody) + rate.toString());
           await audioDb.cache.delete(hash).catch(e=>console.warn(e));
           continue; 
        }
      }

      setAudioExportProgress({ current: audioElements.length, total: audioElements.length, status: '执行智能音频闪避 (Ducking) 与母带混音...' });
      await new Promise(resolve => setTimeout(resolve, 100)); 

      const offlineCtx = new OfflineAudioContext(2, sampleRate * currentTime, sampleRate);
      
      // Ducking Logic for BGM
      if (currentChapter.bgmUrl) {
         try {
           const bgmRes = await fetch(currentChapter.bgmUrl);
           const bgmArray = await bgmRes.arrayBuffer();
           const bgmBuffer = await audioContext.decodeAudioData(bgmArray);
           const bgmSource = offlineCtx.createBufferSource();
           bgmSource.buffer = bgmBuffer;
           bgmSource.loop = true;
           
           const bgmGain = offlineCtx.createGain();
           bgmGain.gain.setValueAtTime(0.3, 0); // 基础音量
           
           // 为每段人声绘制包络线降低背景音 (解决之前缺少参数的Bug)
           audioBuffers.forEach(({ buffer, startTime, rate }) => {
              const voiceDuration = buffer.duration / rate;
              // 参数：目标值, 开始时间, 时间常数(控制平滑过渡的速度)
              bgmGain.gain.setTargetAtTime(0.05, startTime, 0.1); 
              bgmGain.gain.setTargetAtTime(0.3, startTime + voiceDuration + 0.5, 0.5);
           });
           
           bgmSource.connect(bgmGain);
           bgmGain.connect(offlineCtx.destination);
           bgmSource.start(0);
         } catch(e) { 
           console.warn("BGM 处理失败", e); 
         }
      }

      audioBuffers.forEach(({ buffer, startTime, rate }) => {
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer; 
        source.playbackRate.value = rate; 
        source.connect(offlineCtx.destination); 
        source.start(startTime);
      });

      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = audioBufferToWav(renderedBuffer);

      const a = document.createElement("a"); 
      a.href = URL.createObjectURL(wavBlob); 
      a.download = `${projectName}_AudioMixdown.wav`; 
      a.click();
      
      setShowExportModal(false); 
      setShowSaveToast(true);
    } catch (e: any) { 
      setError(`音频导出失败: ${e.message}`); 
    } finally { 
      setIsProcessing(false); 
      setAudioExportProgress(null); 
    }
  };

  const handleSplitElement = useCallback((id: string, textBefore: string, textAfter: string) => {
    setChapters(prev => prev.map(ch => {
      if (ch.id !== currentChapterId) return ch;
      const idx = ch.parsedElements.findIndex(e => e.id === id);
      if (idx === -1) return ch;
      const original = ch.parsedElements[idx];
      const newEl1: ScriptElement = { ...original, content: textBefore.trim() };
      const newEl2: ScriptElement = { ...original, id: `el-${Date.now()}-split`, content: textAfter.trim() };
      const newElements = [...ch.parsedElements.slice(0, idx), newEl1, newEl2, ...ch.parsedElements.slice(idx + 1)];
      return { ...ch, parsedElements: newElements };
    }));
    setEditingElementId(null);
  }, [currentChapterId, setChapters]);

  const handleMergeUpElement = useCallback((id: string) => {
    setChapters(prev => prev.map(ch => {
      if (ch.id !== currentChapterId) return ch;
      const idx = ch.parsedElements.findIndex(e => e.id === id);
      if (idx <= 0) return ch; 
      const prevEl = ch.parsedElements[idx - 1];
      const currentEl = ch.parsedElements[idx];
      const mergedEl: ScriptElement = { ...prevEl, content: prevEl.content + (currentEl.content ? '\n' + currentEl.content : '') };
      const newElements = [...ch.parsedElements.slice(0, idx - 1), mergedEl, ...ch.parsedElements.slice(idx + 1)];
      return { ...ch, parsedElements: newElements };
    }));
    setEditingElementId(null);
  }, [currentChapterId, setChapters]);

  const handleMergeDownElement = useCallback((id: string) => {
    setChapters(prev => prev.map(ch => {
      if (ch.id !== currentChapterId) return ch;
      const idx = ch.parsedElements.findIndex(e => e.id === id);
      if (idx >= ch.parsedElements.length - 1) return ch; 
      const currentEl = ch.parsedElements[idx];
      const nextEl = ch.parsedElements[idx + 1];
      const mergedEl: ScriptElement = { ...currentEl, content: currentEl.content + (nextEl.content ? '\n' + nextEl.content : '') };
      const newElements = [...ch.parsedElements.slice(0, idx), mergedEl, ...ch.parsedElements.slice(idx + 2)];
      return { ...ch, parsedElements: newElements };
    }));
    setEditingElementId(null);
  }, [currentChapterId, setChapters]);

  const runComplianceCheck = () => {
    setIsProcessing(true);
    const issues: Record<string, string[]> = {};
    currentChapter.parsedElements.forEach(el => {
      const foundWords: string[] = [];
      SENSITIVE_WORDS.forEach(word => { 
        if (el.content.includes(word) || el.meta.includes(word)) foundWords.push(word); 
      });
      if (foundWords.length > 0) issues[el.id] = foundWords;
    });
    
    setTimeout(() => {
      setComplianceIssues(issues); 
      setIsProcessing(false);
      const issueCount = Object.keys(issues).length;
      if (issueCount > 0) {
        setError(`发现 ${issueCount} 处敏感词违规，已在剧本中标红。请手动修改或使用局部重写。`);
      }
    }, 500);
  };

  const handleGlobalReplace = () => {
    if (!cmdKSearch || !replaceTarget) return;
    const count = batchReplaceContent(cmdKSearch, replaceTarget);
    setCmdKOpen(false); 
    setCmdKSearch(""); 
    setReplaceTarget("");
    setError(`已在当前章节替换 ${count} 处匹配项。`);
    setTimeout(() => setError(null), 3000);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveCurrentProject(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { if (e.shiftKey) { e.preventDefault(); redo(); } else { e.preventDefault(); undo(); } }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setCmdKOpen(true); setCmdKMode('commands'); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); setCmdKOpen(true); setCmdKMode('replace'); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { if (inlineRewriteId) handleInlineRewrite(inlineRewriteId); }
      if (e.key === 'Escape') { 
        setEditingElementId(null); 
        setEditingCharId(null); 
        setEditingSidebarChapterId(null); 
        setInlineRewriteId(null); 
        setShowSnapshotModal(false); 
        setCmdKOpen(false); 
      }
      if (e.key === ' ' && viewMode === 'teleprompter' && !editingElementId) {
         e.preventDefault();
         const nextIdx = Math.min((hoveredCardIndex || 0) + 1, currentChapter.parsedElements.length - 1);
         setHoveredCardIndex(nextIdx);
         virtuosoRef.current?.scrollToIndex({ index: nextIdx, align: 'center', behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveCurrentProject, editingElementId, inlineRewriteId, viewMode, hoveredCardIndex, currentChapter.parsedElements.length, undo, redo]);

  useEffect(() => { 
    if (cmdKOpen && cmdKInputRef.current) cmdKInputRef.current.focus(); 
  }, [cmdKOpen, cmdKMode]);

  const startResizing = () => setIsResizing(true);
  const stopResizing = () => setIsResizing(false);
  const onResize = useCallback((e: MouseEvent) => { 
    if (isResizing) setSidebarWidth(Math.min(Math.max(200, e.clientX), 450)); 
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) { 
      window.addEventListener("mousemove", onResize); 
      window.addEventListener("mouseup", stopResizing); 
    } else { 
      window.removeEventListener("mousemove", onResize); 
      window.removeEventListener("mouseup", stopResizing); 
    }
    return () => { 
      window.removeEventListener("mousemove", onResize); 
      window.removeEventListener("mouseup", stopResizing); 
    };
  }, [isResizing, onResize]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
       if (!isDraggingSplitter || !splitContainerRef.current) return;
       const containerRect = splitContainerRef.current.getBoundingClientRect();
       const newPercentage = ((e.clientX - containerRect.left) / containerRect.width) * 100;
       setSourceWidthRatio(Math.min(Math.max(20, newPercentage), 70)); 
    };
    const handleMouseUp = () => setIsDraggingSplitter(false);

    if (isDraggingSplitter) { 
      document.body.style.cursor = 'col-resize'; 
      window.addEventListener('mousemove', handleMouseMove); 
      window.addEventListener('mouseup', handleMouseUp); 
    } else { 
      document.body.style.cursor = ''; 
    }
    return () => { 
      window.removeEventListener('mousemove', handleMouseMove); 
      window.removeEventListener('mouseup', handleMouseUp); 
    }
  }, [isDraggingSplitter]);

  const applyHighlights = (cardIdx: number) => {
    const src = sourceScrollRef.current; if (!src) return;
    const paras = Array.from(src.querySelectorAll('p')) as HTMLElement[];
    const activeElement = currentChapter.parsedElements[cardIdx];
    let activeParaIds: number[] = [];
    if (activeElement && activeElement.sourceParaIds && activeElement.sourceParaIds.length > 0) {
      activeParaIds = activeElement.sourceParaIds;
    } else {
      activeParaIds = [Math.round((cardIdx / Math.max(1, currentChapter.parsedElements.length - 1)) * Math.max(0, paras.length - 1))];
    }
    paras.forEach((p, idx) => p.classList.toggle('active', activeParaIds.includes(idx)));
  };

  const handleSourceScroll = () => {
    if (!syncScroll || !sourceScrollRef.current || !virtuosoRef.current || isAutoPlayingRef.current) return;
    if (scrollLeaderRef.current !== 'source') return;

    const src = sourceScrollRef.current;
    const paras = Array.from(src.querySelectorAll('p')) as HTMLElement[];
    if (!paras.length || !currentChapter.parsedElements.length) return;

    const srcMid = src.scrollTop + (src.clientHeight / 2);
    let closestParaIdx = 0; 
    let minDiff = Infinity;
    
    paras.forEach((p, idx) => {
        const diff = Math.abs(p.offsetTop + (p.clientHeight / 2) - srcMid);
        if (diff < minDiff) { 
          minDiff = diff; 
          closestParaIdx = idx; 
        }
    });

    let targetCardIdx = -1;
    for (let i = 0; i < currentChapter.parsedElements.length; i++) { 
      if (currentChapter.parsedElements[i].sourceParaIds?.includes(closestParaIdx)) { 
        targetCardIdx = i; 
        break; 
      } 
    }
    
    if (targetCardIdx === -1) {
        let nearestCard = 0; 
        let minIdDiff = Infinity;
        for (let i = 0; i < currentChapter.parsedElements.length; i++) {
            const el = currentChapter.parsedElements[i];
            if (el.sourceParaIds && el.sourceParaIds.length > 0) {
                const d = Math.abs(el.sourceParaIds[0] - closestParaIdx);
                if (d < minIdDiff) { 
                  minIdDiff = d; 
                  nearestCard = i; 
                }
            }
        }
        targetCardIdx = nearestCard;
    }
    
    setHoveredCardIndex(targetCardIdx); 
    applyHighlights(targetCardIdx);
    virtuosoRef.current.scrollToIndex({ index: targetCardIdx, align: 'center', behavior: 'auto' });
  };

  const parseScript = useCallback((text: string, existingElements: ScriptElement[] = []): ScriptElement[] => {
    let cleanText = text.replace(/<thinking>[\s\S]*?(?:<\/thinking>|$)/g, '');
    const lines = cleanText.split("\n").filter(l => l.trim() !== "");
    const elements: ScriptElement[] = [];
    
    lines.forEach((line) => {
      const match = line.match(/^【([^】]+)】(?:\s*\[([^\]]+)\]\s*)?[：: ]*(.*)$/);
      if (match) {
        const speaker = match[1].trim(); 
        const paraIdsStr = match[2]; 
        const fullContent = match[3].trim();
        
        let sourceParaIds: number[] = []; 
        if (paraIdsStr) {
          sourceParaIds = paraIdsStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        }
        
        const metaMatch = fullContent.match(/\((.*?)\)|（(.*?)）/); 
        const meta = metaMatch ? (metaMatch[1] || metaMatch[2]) : "自然";
        const content = fullContent.replace(/\(.*?\)|（.*?）/, "").trim();
        
        let type: "narration" | "dialogue" | "sound_effect" = "dialogue";
        if (speaker === "旁白") type = "narration"; 
        if (speaker.includes("场景音") || speaker.includes("环境音") || speaker.includes("音效")) type = "sound_effect";
        
        const stableId = existingElements[elements.length]?.id || `el-${Date.now()}-${elements.length}-${Math.random().toString(36).substr(2, 5)}`;
        elements.push({ id: stableId, type, meta, content, speaker: type === "dialogue" ? speaker : undefined, sourceParaIds });
      } else if (elements.length > 0) {
        elements[elements.length - 1].content += (elements[elements.length - 1].content ? "\n" : "") + line.trim();
      }
    });
    return elements;
  }, []);

  const runGenerationForChapter = async (targetChapterId: string) => {
    const chap = chapters.find(c => c.id === targetChapterId);
    if (!chap || !chap.novelText.trim()) return false;

    abortControllerRef.current = new AbortController();
    setIsProcessing(true); 
    setIsStreaming(true); 
    setComplianceIssues({}); 
    setError(null); 
    setAiThinkingProcess("");
    let accumulatedText = "";

    try {
      const currentIndex = chapters.findIndex(c => c.id === targetChapterId);
      let previousContext = "";
      if (currentIndex > 0) {
        const prevNovel = chapters[currentIndex - 1].novelText;
        previousContext = `\n【前情提要（上一章结尾，仅供理解上下文，不要输出到本章）】：\n${prevNovel.slice(-500)}\n`;
      }

      const charPrompt = characters.map(c => `- ${c.name}：${c.gender}/${c.age}，${c.tone}。${c.description}`).join("\n");
      const directorPrompt = chap.directorNote ? `\n【导演特别备注/情景设定】：\n${chap.directorNote}\n` : "";
      
      const systemInstruction = `你是一位顶级的有声书改编专家和音频导演。当前风格：${prodStyle}。
全局人设配置：
${charPrompt}${directorPrompt}
${previousContext}
【核心任务】
将带有段落编号的小说原文，100%无损转化为适合多人有声书的演播剧本。

【极为重要的红线规则】
必须 100% 保留原文的情节、景物、心理、动作描写及对话！绝对禁止删减或高度概括！每一句话都要保留。

【执行 Pipeline (重要！必须按此步骤输出)】
第一步：你必须先使用 <thinking> 和 </thinking> 标签包裹你的分析过程。在分析中，你要梳理：
1. 哪些是物理环境音？
2. 哪些是角色的肢体动作？(这些要剥离给旁白)
3. 哪句话属于哪个角色？(解决指代不明的问题)

第二步：思考结束后，在 <thinking> 标签外部，输出最终的剧本。剧本必须且只使用以下三种前缀格式，且每个条目必须附带其对应的[原段落编号]（多个逗号隔开）：
【旁白】[0,1]：（情感氛围）客观描述或角色动作。
【角色名】[2]：（语气）角色的台词！(禁止在括号里写动作)
【场景音】[3]：（详细的物理环境音效）`;
      
      const numberedText = chap.novelText.split("\n").filter(p => p.trim()).map((p, i) => `[${i}] ${p}`).join("\n");
      setChapters(prev => prev.map(c => c.id === targetChapterId ? { ...c, scriptText: "", parsedElements: [] } : c));

      const stream = generateAiStream({
        model: localStorage.getItem('vox_custom_model') || selectedModel,
        prompt: numberedText,
        systemInstruction,
        signal: abortControllerRef.current.signal
      });

      let currentElements: ScriptElement[] = []; 

      for await (const chunk of stream) {
        accumulatedText += chunk;
        const thinkingMatch = accumulatedText.match(/<thinking>([\s\S]*?)(?:<\/thinking>|$)/);
        if (thinkingMatch && targetChapterId === currentChapterId) {
          setAiThinkingProcess(thinkingMatch[1].trim());
        }

        const parsed = parseScript(accumulatedText, currentElements);
        currentElements = parsed; 

        setChapters(prev => prev.map(c => c.id === targetChapterId ? { ...c, scriptText: accumulatedText, parsedElements: parsed } : c));
      }
      return true;
    } catch (e: any) { 
      if (e.message !== "AbortError" && e.name !== "AbortError") {
        setError(`[${chap.title}] 制作失败：${e.message}`); 
      }
      return false;
    } finally { 
      setIsProcessing(false); 
      setIsStreaming(false); 
      abortControllerRef.current = null;
    }
  };

  const runGeneration = async () => {
    if (!currentChapter.novelText.trim()) { setError("原文内容不能为空"); return; }
    if (currentChapter.parsedElements.length > 0) {
      createSnapshot(`生成前自动备份 (${currentChapter.parsedElements.length} 条数据)`);
    }
    await runGenerationForChapter(currentChapterId);
  };

  const startBatchGeneration = async () => {
    if (isBatchingRef.current) {
       isBatchingRef.current = false; 
       setIsBatching(false);
       if (abortControllerRef.current) abortControllerRef.current.abort();
       return;
    }
    
    const targetChapters = chapters.filter(c => c.novelText.trim() !== "" && c.parsedElements.length === 0);
    if (targetChapters.length === 0) { 
      setError("没有找到需要生成的空白章节（原文已存在且剧本为空）。"); 
      return; 
    }

    isBatchingRef.current = true; 
    setIsBatching(true);
    
    for (const chap of targetChapters) {
      if (!isBatchingRef.current) break;
      setCurrentChapterId(chap.id);
      
      const success = await runGenerationForChapter(chap.id);
      if (success) {
        saveCurrentProject(); 
      } else {
        break;
      }
      if (isBatchingRef.current) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    isBatchingRef.current = false; 
    setIsBatching(false);
  };

  const stopGeneration = () => { 
    if (abortControllerRef.current) abortControllerRef.current.abort(); 
    if (isBatchingRef.current) { 
      isBatchingRef.current = false; 
      setIsBatching(false); 
    }
  };

  const handleInlineRewrite = async (elId: string) => {
    if (!inlineRewritePrompt.trim()) return;
    const targetEl = currentChapter.parsedElements.find(e => e.id === elId);
    if (!targetEl) return;

    setIsProcessing(true); 
    try {
      const prompt = `你是一个有声书导演。请根据新的【导演意见】重写这句台词。
原始文本：
【${targetEl.speaker || (targetEl.type === 'narration' ? '旁白' : '音效')}】：（${targetEl.meta}）${targetEl.content}
导演意见：\n${inlineRewritePrompt}\n要求直接输出修改后的单行结果，严禁输出多余解释。`;

      const res = await generateAiContent({ model: localStorage.getItem('vox_custom_model') || selectedModel, prompt });
      const parsedRes = parseScript(res || "", []); 
      if (parsedRes.length > 0) {
        const newEl = parsedRes[0];
        setPendingDiffs(prev => ({ ...prev, [elId]: newEl }));
      }
    } catch (e: any) { 
      setError(`局部重写失败：${e.message}`); 
    } finally { 
      setIsProcessing(false); 
      setInlineRewriteId(null); 
      setInlineRewritePrompt(""); 
    }
  };

  const acceptDiff = useCallback((id: string) => {
    const diff = pendingDiffs[id];
    if (diff) {
       createSnapshot(`接受AI重写: ${diff.speaker || '元素'}`);
       updateScriptElement(id, { 
         content: diff.content, 
         meta: diff.meta, 
         speaker: diff.speaker || currentChapter.parsedElements.find(e=>e.id===id)?.speaker, 
         type: diff.type 
       });
       setPendingDiffs(prev => { 
         const n = {...prev}; 
         delete n[id]; 
         return n; 
       });
       if (complianceIssues[id]) {
          const newIssues = {...complianceIssues}; 
          delete newIssues[id]; 
          setComplianceIssues(newIssues);
       }
    }
  }, [pendingDiffs, currentChapter.parsedElements, complianceIssues, updateScriptElement]);

  const rejectDiff = useCallback((id: string) => { 
    setPendingDiffs(prev => { 
      const n = {...prev}; 
      delete n[id]; 
      return n; 
    }); 
  }, []);

  // ============================================================================
  // AI 智能选角 (新增 VoiceID 匹配 & 渐变头像)
  // ============================================================================
  const extractCharacters = async () => { 
    if (!currentChapter.novelText.trim()) return;
    setIsProcessing(true);
    
    try {
      const sample = chapters.slice(0, 10).map(c => c.novelText).join("\n\n").slice(0, 12000);
      const voiceCatalogPrompt = EDGE_VOICES_CATALOG.map(v => `${v.id} (${v.desc})`).join(", ");
      
      const prompt = `你是一个资深文学编辑与有声书选角导演。请提取小说全部角色，并根据角色性格与描述从给定音色库中分配最匹配的音色与语气。请务必使用中文回答所有内容（包括性格特征与简介）。
【可用音色库】：${voiceCatalogPrompt}

输出严格 JSON 数组格式，不要任何 Markdown 标记。哪怕只提取到一个，也必须是合法的带有结尾大括号的JSON数组！
字段：[{"name":"姓名","gender":"性别","age":"年龄段","tone":"语气与性格特征","description":"背景简介","voiceId":"必须从上面的库中选择"}]
文本：\n${sample}`;

      let rawText = await generateAiContent({ model: localStorage.getItem('vox_custom_model') || selectedModel, prompt, jsonMode: true }) || "[]";
      
      const firstBracket = rawText.indexOf('['); 
      let lastBracket = rawText.lastIndexOf(']');
      
      if (firstBracket !== -1) {
        if (lastBracket <= firstBracket) {
          const lastObjEnd = rawText.lastIndexOf('}');
          if (lastObjEnd > firstBracket) {
            rawText = rawText.substring(firstBracket, lastObjEnd + 1) + ']';
          } else {
            throw new Error("模型中断且未能生成任何完整的角色对象。");
          }
        } else {
          rawText = rawText.substring(firstBracket, lastBracket + 1);
        }
      }

      const extracted = JSON.parse(rawText.trim());
      if (!Array.isArray(extracted)) throw new Error("返回结果并非数组");

      const existing = new Set(characters.map(c => c.name));
      const fresh = extracted.filter((c: any) => c.name && !existing.has(c.name)).map((c: any, i: number) => ({ 
        ...c, 
        id: `char-${Date.now()}-${i}`, 
        voiceId: c.voiceId || "",
        color: COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)],
        avatarGradient: generateGradient(c.name)
      }));
      
      setCharacters(prev => [...prev, ...fresh]); 
      setActiveTab("cast");
    } catch (e: any) { 
      setError(`角色提取中断或解析失败，可能是 AI 服务器繁忙被截断，请重试。(${e.message})`); 
    } finally { 
      setIsProcessing(false); 
    }
  };

  const generateChapterExport = (chap: Chapter, format: 'txt' | 'markdown' | 'word' | 'excel'): string => {
    if (!chap.parsedElements || chap.parsedElements.length === 0) return chap.scriptText.replace(/\[[0-9,\s]+\]/g, "");
    
    if (format === 'txt') {
      return chap.parsedElements.map(el => `【${el.type === 'dialogue' ? el.speaker : el.type === 'narration' ? '旁白' : '场景音'}】：（${el.meta}）${el.content}`).join('\n\n');
    }
    if (format === 'markdown') {
      return chap.parsedElements.map(el => `**【${el.type === 'dialogue' ? el.speaker : el.type === 'narration' ? '旁白' : '场景音'}】**：^（${el.meta}）^ ${el.content}`).join('\n\n');
    }
    if (format === 'word') {
      return chap.parsedElements.map(el => `<div style="margin-bottom: 12px; font-family: 'Microsoft YaHei', sans-serif; line-height: 1.6;"><strong style="color: ${el.type === 'dialogue' ? '#e11d48' : el.type === 'narration' ? '#0ea5e9' : '#d97706'};">【${el.type === 'dialogue' ? el.speaker : el.type === 'narration' ? '旁白' : '场景音效'}】</strong><span style="color: #666666; font-style: italic;">（${el.meta}）</span><span style="font-size: 16px; color: #333333;">${el.content}</span></div>`).join('');
    }
    return "";
  };

  const exportToExcel = async (chaptersToExport: Chapter[], isAll: boolean) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VoxScript Studio'; 
    workbook.created = new Date();
    
    for (const chapter of chaptersToExport) {
      if (chapter.parsedElements.length === 0) continue;
      
      const safeTitle = chapter.title.replace(/[\[\]\*?:\/\\]/g, '').substring(0, 31) || 'Sheet';
      const sheet = workbook.addWorksheet(safeTitle, { views: [{ state: 'frozen', ySplit: 1 }] });
      
      sheet.columns = [
        { header: '序号', key: 'index', width: 8 }, 
        { header: '类型', key: 'type', width: 12 },
        { header: '角色', key: 'speaker', width: 16 }, 
        { header: '提示/语气', key: 'meta', width: 22 }, 
        { header: '台词内容', key: 'content', width: 65 }
      ];
      
      sheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12, name: 'Microsoft YaHei' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } }; 
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      sheet.getRow(1).height = 28;
      
      chapter.parsedElements.forEach((el, idx) => {
        const row = sheet.addRow({ 
          index: idx + 1, 
          type: el.type === 'dialogue' ? '对白' : el.type === 'narration' ? '旁白' : '音效', 
          speaker: el.type === 'dialogue' ? el.speaker : el.type === 'narration' ? '旁白' : '音效', 
          meta: el.meta || '', 
          content: el.content || '' 
        });
        
        row.eachCell((cell, colNumber) => {
          cell.border = { top: { style: 'thin', color: { argb: 'FFDDDDDD' } }, left: { style: 'thin', color: { argb: 'FFDDDDDD' } }, bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } }, right: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
          cell.font = { size: 11, name: 'Microsoft YaHei' };
          cell.alignment = { vertical: 'middle', horizontal: colNumber === 5 ? 'left' : 'center', wrapText: colNumber === 5 };
          
          if (colNumber === 2 || colNumber === 3) {
            if (el.type === 'dialogue') cell.font = { color: { argb: 'FF0284C7' }, bold: true, size: 11, name: 'Microsoft YaHei' }; 
            else if (el.type === 'sound_effect') cell.font = { color: { argb: 'FFD97706' }, bold: true, size: 11, name: 'Microsoft YaHei' }; 
            else cell.font = { color: { argb: 'FF475569' }, bold: true, size: 11, name: 'Microsoft YaHei' }; 
          }
        });
      });
    }
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), isAll ? `${projectName}_全本合并.xlsx` : `${projectName}_${chaptersToExport[0].title}.xlsx`);
  };
  
  const executeExport = async () => {
    if (exportFormat === 'audio') { exportAudioMixdown(); return; }
    
    if (exportFormat === 'excel') {
      setIsProcessing(true);
      try {
        const chaptersToExport = exportScope === 'single' ? [currentChapter] : chapters.filter(c => c.scriptText.trim() !== "");
        if (chaptersToExport.length === 0 || chaptersToExport.every(c => c.parsedElements.length === 0)) { 
          setError("没有可导出的生成剧本"); 
          setIsProcessing(false); 
          return; 
        }
        await exportToExcel(chaptersToExport, exportScope === 'all'); 
        setShowExportModal(false); 
        setShowSaveToast(true);
      } catch (e: any) { 
        setError(`Excel 导出失败: ${e.message}`); 
      } finally { 
        setIsProcessing(false); 
      }
      return;
    }

    let finalContent = ""; 
    let mimeType = "text/plain;charset=utf-8"; 
    let extension = "txt"; 
    let fileName = "";
    
    if (exportFormat === 'word') { 
      mimeType = "application/msword;charset=utf-8"; 
      extension = "doc"; 
    } else if (exportFormat === 'markdown') {
      extension = "md";
    }

    if (exportScope === 'single') {
      if (!currentChapter.scriptText) { setError("当前章节没有可导出的剧本"); return; }
      fileName = `${projectName}_${currentChapter.title}.${extension}`;
      if (exportFormat === 'word') {
        finalContent += `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${currentChapter.title}</title></head><body><h1 style="text-align: center; font-family: 'Microsoft YaHei', sans-serif;">${currentChapter.title}</h1>${generateChapterExport(currentChapter, exportFormat)}</body></html>`;
      } else {
        finalContent += generateChapterExport(currentChapter, exportFormat);
      }
    } else {
      const generatedChapters = chapters.filter(c => c.scriptText.trim() !== "");
      if (generatedChapters.length === 0) { setError("没有可导出的已生成剧本"); return; }
      fileName = `${projectName}_全本合并.${extension}`;
      if (exportFormat === 'word') {
        const body = generatedChapters.map(c => `<h1 style="text-align: center; font-family: 'Microsoft YaHei', sans-serif; page-break-before: always;">${c.title}</h1>${generateChapterExport(c, exportFormat)}`).join('');
        finalContent += `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${projectName}</title></head><body>${body}</body></html>`;
      } else {
        const divider = exportFormat === 'markdown' ? '\n\n---\n\n' : '\n\n================================\n\n';
        finalContent += generatedChapters.map(c => `${exportFormat === 'markdown' ? `## ${c.title}` : `[ ${c.title} ]`}\n\n${generateChapterExport(c, exportFormat)}`).join(divider);
      }
    }
    
    const a = document.createElement("a"); 
    a.href = URL.createObjectURL(new Blob([finalContent], { type: mimeType })); 
    a.download = fileName; 
    a.click(); 
    setShowExportModal(false);
  };

  const submitRenameVaultProject = async (id: string) => {
    if (!vaultProjectName.trim()) { setEditingVaultProjectId(null); return; }
    setSavedProjects(prev => prev.map(p => p.id === id ? { ...p, name: vaultProjectName } : p));
    if (projectId === id) setProjectName(vaultProjectName);
    setEditingVaultProjectId(null); 
    setShowSaveToast(true); 
    setTimeout(() => setShowSaveToast(false), 2000);
  };

  const handleExportProjectJson = (p: Project) => {
    const dataStr = JSON.stringify(p, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); 
    a.href = url; 
    a.download = `${p.name}_VoxProject.json`;
    a.click(); 
    URL.revokeObjectURL(url);
  };

  const handleCloneVaultProject = (p: Project) => {
    const newProject = { ...p, id: `proj-${Date.now()}`, name: `${p.name} (副本)`, lastModified: Date.now() };
    setSavedProjects(prev => [newProject, ...prev]); 
    setShowSaveToast(true); 
    setTimeout(() => setShowSaveToast(false), 2000);
  };

  const loadProject = (p: Project) => { 
    setProjectId(p.id); 
    setProjectName(p.name); 
    setChapters(p.chapters); 
    setCurrentChapterId(p.chapters[0]?.id || "ch-1"); 
    setCharacters(p.characters); 
    setProdStyle(p.prodStyle); 
    setReadingSpeed(p.readingSpeed); 
    setTheme(p.theme || "light"); 
    setGlobalPronunciations(p.globalPronunciations || {}); 
    setShowProjectModal(false); 
  };
  
  const deleteProject = (id: string) => {
    setSavedProjects(prev => prev.filter(p => p.id !== id));
  };
  
  const createNewProject = () => { 
    setProjectId(`proj-${Date.now()}`); 
    setProjectName("未命名剧作"); 
    setChapters([{ id: "ch-1", title: "点击输入原文", novelText: "", scriptText: "", parsedElements: [] }]); 
    setCurrentChapterId("ch-1"); 
    setCharacters([{ id: "nar", name: "旁白", age: "成熟", gender: "中性", tone: "磁性睿智", description: "环境烘托与情节转场", voiceId: "zh-CN-XiaoxiaoNeural", color: "bg-slate-500", avatarGradient: "linear-gradient(135deg, #64748b, #334155)" }]); 
    setActiveTab("book"); 
    setGlobalPronunciations({}); 
    setShowProjectModal(false); 
  };
  
  const saveAsProject = () => { 
    const newId = `proj-${Date.now()}`; 
    const newName = `${projectName} (副本)`; 
    setSavedProjects(prev => [{ id: newId, name: newName, lastModified: Date.now(), chapters, characters, prodStyle, readingSpeed, theme, globalPronunciations }, ...prev]); 
    setProjectId(newId); 
    setProjectName(newName); 
    setShowSaveToast(true); 
    setTimeout(() => setShowSaveToast(false), 2000); 
  };
  
  const handleImportProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; 
    if (!file) return;
    const reader = new FileReader(); 
    reader.onload = (event) => { 
      try { 
        const imported = JSON.parse(event.target?.result as string) as Project; 
        imported.id = `proj-imported-${Date.now()}`; 
        setSavedProjects(prev => [imported, ...prev]); 
        loadProject(imported); 
      } catch (err) { 
        setError("导入失败：无效的项目文件格式"); 
      } 
    }; 
    reader.readAsText(file);
  };

  const commandPaletteOptions = [
    { id: 'gen', icon: Zap, label: '生成演播剧本 (Generate Script)', action: runGeneration },
    { id: 'undo', icon: Undo2, label: '撤销上一步操作 (Undo)', action: () => undo() },
    { id: 'redo', icon: Redo2, label: '重做上一步操作 (Redo)', action: () => redo() },
    { id: 'export', icon: Download, label: '导出音频/文稿 (Export)', action: () => setShowExportModal(true) },
    { id: 'settings', icon: Settings, label: '全局配置 (Settings)', action: () => setShowSettingsModal(true) },
    { id: 'vault', icon: FolderOpen, label: '打开项目中台 (Vault)', action: () => setShowProjectModal(true) },
    { id: 'teleprompter', icon: Presentation, label: '进入提词器模式 (Teleprompter)', action: () => { setZenMode(true); setViewMode('teleprompter'); setActiveTab('studio'); } },
    { id: 'zen', icon: Maximize, label: '切换沉浸模式 (Zen Mode)', action: () => setZenMode(!zenMode) },
    { id: 'theme-dark', icon: Moon, label: '切换纯黑主题 (OLED Dark)', action: () => setTheme('dark') },
    { id: 'theme-light', icon: Sun, label: '切换明亮主题 (Light)', action: () => setTheme('light') }
  ];
  const filteredCommands = commandPaletteOptions.filter(c => c.label.toLowerCase().includes(cmdKSearch.toLowerCase()));

  const themeConfig = {
    dark: { bg: "bg-[#050505]", text: "text-slate-300", nav: "bg-[#000000]/90", border: "border-slate-800/60", card: "bg-[#0f0f13]", accent: "text-sky-400", btn: "bg-sky-600", sidebar: "bg-[#050505]", subtile: "text-slate-500" },
    light: { bg: "bg-[#f8fafc]", text: "text-slate-900", nav: "bg-white/90", border: "border-slate-200", card: "bg-white shadow-sm", accent: "text-sky-600", btn: "bg-sky-500", sidebar: "bg-slate-50", subtile: "text-slate-400" },
    forest: { bg: "bg-[#022c22]", text: "text-emerald-50", nav: "bg-[#064e3b]/90", border: "border-emerald-800", card: "bg-emerald-900/40", accent: "text-emerald-400", btn: "bg-emerald-600", sidebar: "bg-emerald-950/20", subtile: "text-emerald-700" }
  };
  const currentTheme = themeConfig[theme];
  const fontSizeClass = { "sm": "text-sm", "base": "text-base", "lg": "text-lg" };

  return (
    <div className={`h-screen flex flex-col ${viewMode === 'teleprompter' ? 'bg-[#000000]' : currentTheme.bg} ${currentTheme.text} font-sans overflow-hidden transition-colors duration-700 relative`}>
      <AnimatePresence>
        {!zenMode && (
          <motion.nav initial={{ y: -100 }} animate={{ y: 0 }} exit={{ y: -100 }} className={`h-16 flex items-center justify-between px-6 ${currentTheme.nav} border-b ${currentTheme.border} backdrop-blur-xl z-[100] shrink-0`}>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${currentTheme.btn} rounded-xl flex items-center justify-center shadow-lg text-white`}><Mic className="w-5 h-5" /></div>
                <div><h1 className="text-sm font-black tracking-wider uppercase opacity-90">VoxStudio v8.0</h1><p className="text-[11px] opacity-40 font-mono tracking-normal italic">DAW EDITION</p></div>
              </div>
              <div className={`h-8 w-px ${currentTheme.border}`} />
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-[11px] font-black opacity-40 uppercase mb-0.5 tracking-wider">Project / 剧本总称</span>
                  <input className="bg-transparent border-none outline-none text-base font-black focus:text-sky-400 transition-colors w-44" value={projectName} onChange={e => setProjectName(e.target.value)} />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setShowProjectModal(true)} className={`p-2 rounded-lg ${theme === 'light' ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-slate-400'} transition-all`} title="项目中台管理"><FolderOpen className="w-4 h-4" /></button>
                  <button onClick={saveCurrentProject} className={`p-2 rounded-lg ${theme === 'light' ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-slate-400'} transition-all`} title="保存当前 (Ctrl+S)"><Save className="w-4 h-4" /></button>
                </div>
              </div>
            </div>

            <div className={`flex ${theme === 'light' ? 'bg-slate-200' : 'bg-slate-900/80'} p-1 rounded-2xl border ${currentTheme.border}`}>
              {[{ id: "book", label: "资源管控", icon: BookOpen }, { id: "cast", label: "角色资产", icon: Users }, { id: "studio", label: "剧本工坊", icon: Zap }].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex items-center gap-2 px-6 py-2.5 text-sm font-black rounded-xl transition-all ${activeTab === t.id ? (theme === 'light' ? 'bg-white text-sky-600 shadow-lg' : 'bg-sky-600 text-white shadow-xl') : 'text-slate-500 hover:text-sky-400'}`}>
                  <t.icon className="w-4 h-4" />{t.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <button onClick={() => setZenMode(true)} className={`p-2 rounded-xl transition-all ${theme === 'light' ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-slate-400'}`} title="沉浸模式 (Zen Mode)"><Maximize className="w-5 h-5" /></button>

              <div className={`flex items-center bg-black/10 rounded-xl p-1 border ${currentTheme.border}`}>
                {(['dark', 'light', 'forest'] as Theme[]).map(t => (
                  <button key={t} onClick={() => setTheme(t)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${theme === t ? 'bg-white/10 shadow-lg scale-110' : 'opacity-40 hover:opacity-100'}`}>
                    {t === 'dark' ? <Moon className="w-4 h-4" /> : t === 'light' ? <Sun className="w-4 h-4" /> : <Leaf className="w-4 h-4 text-emerald-500" />}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowSettingsModal(true)} className={`p-2 rounded-xl transition-all border ${currentTheme.border} ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`} title="全局配置"><Settings className="w-5 h-5" /></button>
              <div className="flex gap-2">
                <button onClick={() => setShowExportModal(true)} className="px-5 py-2.5 bg-white text-slate-950 rounded-xl text-xs font-black shadow-lg flex items-center gap-2 hover:bg-sky-50 transition-all active:scale-95 text-nowrap">
                  <Download className="w-4 h-4 text-sky-500" /> 导出资源
                </button>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      <main className="flex-1 flex overflow-hidden z-10 pb-16 relative">
        <AnimatePresence>
          {!zenMode && (
            <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: sidebarWidth, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className={`border-r ${currentTheme.border} ${currentTheme.sidebar} flex flex-col shrink-0 transition-all duration-75 relative backdrop-blur-md overflow-hidden z-20`}>
              <div className={`p-5 flex justify-between items-center ${theme === 'light' ? 'bg-slate-200/50' : 'bg-slate-950/20'} border-b ${currentTheme.border}`}>
                <span className="text-[11px] font-black opacity-40 uppercase tracking-wider">Directory / 章节</span>
                <button onClick={() => { const id = `ch-${Date.now()}`; setChapters([...chapters, { id, title: "新章节", novelText: "", scriptText: "", parsedElements: [] }]); setCurrentChapterId(id); }} className="p-1.5 text-sky-500 hover:bg-sky-500/10 rounded-lg transition-all"><Plus className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-hide">
                {chapters.map((ch, idx) => (
                  <div key={ch.id} onClick={() => setCurrentChapterId(ch.id)} className={`group relative p-4 rounded-2xl cursor-pointer border transition-all ${currentChapterId === ch.id ? (theme === 'light' ? 'bg-sky-500 text-white border-sky-600/20 shadow-lg' : 'bg-sky-600/10 border-sky-500/40 text-sky-400') : `border-transparent opacity-60 hover:opacity-100 ${theme === 'light' ? 'hover:bg-slate-200' : 'hover:bg-slate-900/50'}`}`}>
                    <div className="flex flex-col gap-1 pr-14">
                      <div className={`text-[11px] font-mono opacity-40 ${currentChapterId === ch.id && theme === 'light' ? 'text-white' : ''}`}>CH-{(idx+1).toString().padStart(2,'0')}</div>
                      {editingSidebarChapterId === ch.id ? (
                        <input autoFocus className={`bg-black/20 text-white border-none outline-none text-sm font-black p-1.5 rounded-lg w-full ring-1 ring-white/20`} value={ch.title} onChange={(e) => updateCurrentChapter({ title: e.target.value })} onBlur={() => setEditingSidebarChapterId(null)} onKeyDown={(e) => e.key === 'Enter' && setEditingSidebarChapterId(null)} onClick={(e) => e.stopPropagation()} />
                      ) : <div className="text-sm font-black leading-tight break-words">{ch.title}</div>}
                    </div>
                    {ch.scriptText && <div className={`absolute top-4 right-4 w-2 h-2 ${currentChapterId === ch.id && theme === 'light' ? 'bg-white' : 'bg-sky-500'} rounded-full`} />}
                    <div className={`absolute bottom-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-10`}>
                      <button onClick={(e) => { e.stopPropagation(); setEditingSidebarChapterId(ch.id); }} className={`p-1.5 hover:bg-black/10 rounded-lg ${currentChapterId === ch.id && theme === 'light' ? 'text-white' : 'text-sky-500'}`}><Settings className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); if(chapters.length > 1) setChapters(chapters.filter(c => c.id !== ch.id)) }} className={`p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg ${currentChapterId === ch.id && theme === 'light' ? 'text-white' : ''}`}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className={`mt-auto p-4 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-950/40'} border-t ${currentTheme.border} space-y-4`}>
                 <div className="flex justify-between items-center"><span className="text-[11px] font-black opacity-40 uppercase">Global Words</span><span className={`text-xs font-mono font-black ${currentTheme.accent}`}>{chapters.reduce((sum, ch) => sum + ch.novelText.length, 0).toLocaleString()}</span></div>
                 <div className="flex justify-between items-center"><span className="text-[11px] font-black opacity-40 uppercase">Est. Runtime</span><span className={`text-xs font-mono font-black ${currentTheme.accent}`}>{(chapters.reduce((sum, ch) => sum + (ch.parsedElements.length * 15), 0) / 60).toFixed(1)} MIN</span></div>
                 
                 <button onClick={startBatchGeneration} className={`w-full mt-2 py-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-black transition-all shadow-sm ${isBatching ? 'bg-sky-500 text-white animate-pulse border-sky-400' : theme === 'light' ? 'bg-white border-slate-200 hover:bg-sky-50' : 'bg-black/20 border-white/5 hover:bg-sky-900/30'}`}>
                   {isBatching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                   {isBatching ? '批量生成中...' : 'Auto-Batch 批量全本'}
                 </button>
              </div>
              <div onMouseDown={startResizing} className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-sky-500 transition-all active:bg-sky-600 z-50 group"><div className="h-full w-full opacity-0 group-hover:opacity-100 bg-sky-500/20" /></div>
            </motion.aside>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {zenMode && (
            <motion.button initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} onClick={() => { setZenMode(false); if(viewMode === 'teleprompter') setViewMode('standard'); }} className={`absolute top-6 left-6 z-50 p-3 rounded-full shadow-2xl hover:scale-110 transition-all cursor-pointer ${viewMode === 'teleprompter' ? 'bg-slate-800 text-white border border-slate-700' : 'bg-sky-500 text-white'}`}><Minimize className="w-5 h-5" /></motion.button>
          )}
        </AnimatePresence>

        <div className="flex-1 flex overflow-hidden relative">
          <AnimatePresence mode="wait">
            {/* TAB: 资源管控 */}
            {activeTab === "book" && (
              <motion.div key="book" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col p-5 gap-5 overflow-hidden w-full z-10">
                <div className={`flex justify-between items-end shrink-0 ${zenMode ? 'pl-20 px-6 mt-4' : 'px-6'}`}>
                  <div className="max-w-xl"><h2 className="text-2xl font-black italic tracking-tighter">Asset Management / 资源管控</h2><p className="text-[11px] opacity-40 mt-1 uppercase tracking-widest font-black leading-none">Global workspace for content processing</p></div>
                  <div className="flex gap-2">
                    <button onClick={() => { const input = document.createElement("input"); input.type = "file"; input.accept = ".txt"; input.onchange = (e: any) => { const r = new FileReader(); r.onload = (ev) => handleSplitImport(ev.target?.result as string); r.readAsText(e.target.files[0]); }; input.click(); }} className={`px-4 py-2.5 ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/10'} border rounded-xl text-xs font-black flex items-center gap-2 hover:border-sky-500 transition-all shadow-sm`}><Upload className="w-4 h-4" /> 批量导入</button>
                    <button onClick={cleanNovelText} className={`px-4 py-2.5 ${theme === 'light' ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-900 border-white/10 text-slate-300'} border rounded-xl text-xs font-black flex items-center gap-2 hover:border-amber-500 hover:text-amber-500 transition-all shadow-sm`}><Eraser className="w-4 h-4" /> 智能清洗文本</button>
                    <button onClick={extractCharacters} disabled={isProcessing || !currentChapter.novelText} className={`px-5 py-2.5 ${currentTheme.btn} rounded-xl text-xs font-black text-white flex items-center gap-2 shadow-lg hover:brightness-110 active:scale-95 transition-all`}>{isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> 人物建模全栈扫描</>}</button>
                  </div>
                </div>

                <div className="flex-1 flex gap-5 overflow-hidden">
                   <div className={`flex-1 ${theme === 'light' ? 'bg-white border-slate-100 shadow-sm' : 'bg-slate-900/10 border-white/5'} border rounded-[2rem] p-8 flex flex-col relative overflow-hidden backdrop-blur-sm`}>
                      <div className="flex items-center gap-3 mb-4"><div className="w-1 h-6 bg-sky-500 rounded-full" /><input className="bg-transparent border-none outline-none text-xl font-black p-0 w-full placeholder:opacity-10 italic tracking-tighter" placeholder="本章标题" value={currentChapter.title} onChange={e => updateCurrentChapter({ title: e.target.value })} /></div>
                      <textarea className={`flex-1 w-full bg-transparent resize-none border-none outline-none ${fontSizeClass[workspaceFontSize]} font-medium leading-relaxed scrollbar-hide whitespace-pre-wrap ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`} placeholder="在此录入或粘贴小说原文内容..." value={currentChapter.novelText} onChange={e => { const text = e.target.value; if (currentChapter.novelText === "" && text.includes("第") && text.length > 2000) handleSplitImport(text); else updateCurrentChapter({ novelText: text }); }} />
                   </div>
                   <div className="w-72 flex flex-col gap-6 shrink-0 h-full">
                      <div className={`flex-1 ${theme === 'light' ? 'bg-slate-50 border-slate-100' : 'bg-black/20 border-white/5'} border rounded-[2.5rem] p-8 flex flex-col shadow-inner overflow-hidden shrink-0 backdrop-blur-sm`}>
                         <h3 className="text-[11px] font-black opacity-50 uppercase tracking-[0.3em] mb-8 italic">Intelligence / 章节情报</h3>
                         <div className="space-y-6 flex-1 overflow-y-auto scrollbar-hide">
                            <div className={`p-6 rounded-2xl ${theme === 'light' ? 'bg-white border-slate-100 shadow-sm' : 'bg-black/20 border-white/5'} border transition-all hover:scale-[1.02]`}>
                               <span className="text-[11px] font-black opacity-50 uppercase block mb-2 italic tracking-wider leading-none">Density Analysis</span>
                               <div className="text-3xl font-black italic tracking-tighter">{(currentChapter.novelText.length / 50).toFixed(1)} <span className="text-[11px] opacity-50 uppercase tracking-widest">Pages</span></div>
                            </div>
                            <div className={`p-6 rounded-2xl ${theme === 'light' ? 'bg-white border-slate-100 shadow-sm' : 'bg-black/20 border-white/5'} border transition-all hover:scale-[1.02] flex flex-col`}>
                               <div className="flex items-center gap-2 mb-2"><Activity className={`w-3.5 h-3.5 opacity-50`} /><span className="text-[11px] font-black opacity-50 uppercase italic tracking-wider leading-none">Emotion Spectrogram</span></div>
                               {emotionData.length > 0 ? (
                                  <div className="flex items-end h-16 gap-[2px] mt-4 w-full overflow-hidden opacity-80">
                                    {emotionData.map((d, i) => <div key={i} className={`flex-1 rounded-t-sm ${d.color} transition-all duration-500`} style={{ height: `${d.score}%`, minHeight: '4px' }} title={`节点 ${i+1}`} />)}
                                  </div>
                                ) : (
                                  <div className="relative mt-4 flex-1">
                                    <div className="absolute inset-0 flex items-end gap-[2px] w-full overflow-hidden opacity-20 grayscale pointer-events-none">
                                      {Array.from({length: 20}).map((_, i) => (
                                        <div key={i} className="flex-1 bg-slate-500 rounded-t-sm" style={{ height: `${Math.random() * 80 + 20}%` }} />
                                      ))}
                                    </div>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                                      <span className={`text-[10px] font-black uppercase tracking-widest ${theme === 'light' ? 'bg-slate-200/80 text-slate-500' : 'bg-black/50 text-white'} px-3 py-1 rounded-full backdrop-blur-md`}>Awaiting Generation</span>
                                    </div>
                                  </div>
                                )}
                            </div>
                         </div>
                      </div>
                   </div>
                </div>
              </motion.div>
            )}

            {/* TAB: 角色资产 */}
            {activeTab === "cast" && (
              <motion.div key="cast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col p-8 lg:p-10 gap-8 overflow-hidden relative z-10">
                 <div className={`flex justify-between items-center shrink-0 ${zenMode ? 'pl-20 px-4 mt-2' : 'px-4'}`}>
                    <h2 className="text-3xl font-black italic tracking-tighter">Cast Personnel / 角色人员库</h2>
                    <div className="flex items-center gap-6">
                       <div className="flex items-end gap-6 bg-black/5 p-4 rounded-2xl border border-black/5 shadow-inner backdrop-blur-sm">
                          <div className="flex flex-col"><span className="text-[11px] font-black opacity-50 uppercase mb-2 leading-none">Art Style</span><select className={`${theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-black/20 border-white/10 text-slate-100'} border rounded-xl px-4 py-2 text-xs font-black outline-none`} value={prodStyle} onChange={e => setProdStyle(e.target.value as any)}>{["都市言情", "热血玄幻", "悬疑惊悚", "技术专业", "温馨治愈"].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                          <div className="flex flex-col"><span className="text-[11px] font-black opacity-50 uppercase mb-2 leading-none">Reading Pace</span><div className={`h-9 w-48 ${theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-black/20 border-white/5'} border rounded-xl flex items-center px-4 gap-3 shadow-inner shrink-0`}><input type="range" min="150" max="400" step="10" className="w-full accent-sky-500" value={readingSpeed} onChange={e => setReadingSpeed(Number(e.target.value))} /><span className={`text-[11px] font-mono font-black ${currentTheme.accent} w-8 shrink-0`}>{readingSpeed}</span></div></div>
                          <button onClick={() => setActiveTab("studio")} className={`h-9 px-5 ${currentTheme.btn} text-white rounded-xl font-black text-xs shadow-sm flex items-center justify-center gap-2 hover:translate-y-[-1px] transition-all transform-gpu active:scale-95 shrink-0`}>去制作 <ChevronRight className="w-4 h-4" /></button>
                       </div>
                    </div>
                 </div>
                 <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-y-auto px-4 scrollbar-hide pb-32">
                    {characters.map(char => {
                      const roleColor = char.color || 'bg-slate-500';
                      return (
                      <div key={char.id} className={`${theme === 'light' ? 'bg-white shadow-xl shadow-slate-200/50 border-slate-100' : theme === 'forest' ? 'bg-emerald-900/60 border-emerald-800/80 text-emerald-50 shadow-2xl' : 'bg-slate-900/80 border-slate-700/60 text-slate-100 shadow-2xl'} p-7 border rounded-[2rem] relative group hover:border-sky-500 transition-all flex flex-col min-h-[260px] backdrop-blur-md overflow-hidden`}>
                         <div className={`absolute top-0 left-0 w-full h-1.5 ${roleColor} opacity-80`} />
                         <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-all z-20">
                            <button onClick={() => setEditingCharId(char.id)} className={`p-2.5 rounded-xl bg-sky-500/10 text-sky-500 hover:bg-sky-500 hover:text-white transition-all`} title="精修"><Settings className="w-4 h-4" /></button>
                            {char.id !== 'nar' && <button onClick={() => setCharacters(characters.filter(c => c.id !== char.id))} className={`p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all`} title="删除"><Trash2 className="w-4 h-4" /></button>}
                         </div>
                         <div className="flex justify-between items-start mb-5 pr-12 relative z-10">
                            <div className="flex items-center gap-4">
                               <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-black shadow-inner border border-white/20 text-white" style={{ background: char.avatarGradient || generateGradient(char.name) }}>
                                  {char.name.charAt(0)}
                               </div>
                               <div>
                                  <div className="flex items-center gap-2">
                                    <h3 className="text-xl font-black truncate max-w-[120px]">{char.name}</h3>
                                    {char.voiceId && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); playAudition(char); }} 
                                        className={`p-1.5 rounded-full transition-all ${auditioningId === char.id ? 'bg-sky-500 text-white animate-pulse shadow-lg' : 'bg-sky-500/10 text-sky-500 hover:bg-sky-500 hover:text-white'}`}
                                        title="试听音色"
                                      >
                                        {auditioningId === char.id ? <Square className="w-3.5 h-3.5 fill-current" /> : <Volume2 className="w-3.5 h-3.5" />}
                                      </button>
                                    )}
                                  </div>
                                  <div className="text-xs opacity-60 font-bold mt-1">{char.gender} / {char.age}</div>
                               </div>
                            </div>
                         </div>
                         <p className="text-sm opacity-60 line-clamp-3 leading-relaxed mb-6 flex-1 italic relative z-10">{char.description}</p>
                         <div className={`mt-auto pt-5 border-t ${currentTheme.border} relative z-10`}><div className="text-[11px] font-black opacity-30 uppercase tracking-widest mb-1.5">Voice Texture / Model</div><div className={`text-sm font-bold ${currentTheme.accent} leading-tight truncate`}>{char.tone} · {char.voiceId || "Unset"}</div></div>
                      </div>
                    )})}
                    <button onClick={() => setCharacters([...characters, { id: `c-${Date.now()}`, name: "新演员", gender: "男", age: "青年", tone: "中性", description: "输入详细设定...", voiceId: "", color: COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)], avatarGradient: generateGradient("新演员") }])} className={`${theme === 'light' ? 'border-slate-200 shadow-sm' : theme === 'forest' ? 'border-emerald-800/50 bg-black/20 text-emerald-100' : 'border-slate-800 bg-black/20 text-slate-300'} border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center transition-all group hover:border-sky-500 min-h-[260px] backdrop-blur-sm`}><Plus className="w-12 h-12 mb-3 group-hover:scale-110 group-hover:text-sky-500 transition-all opacity-20" /><span className="text-[11px] font-black uppercase tracking-[0.3em] opacity-30">Deploy Actor</span></button>
                 </div>
              </motion.div>
            )}

            {/* TAB: 剧本工坊 */}
            {activeTab === "studio" && (
              <motion.div key="studio" initial={{ opacity: 0, scale: 1.01 }} animate={{ opacity: 1, scale: 1 }} className={`flex-1 flex flex-col ${viewMode === 'teleprompter' ? 'p-0' : 'p-6 gap-6'} overflow-hidden ${viewMode === 'teleprompter' ? 'bg-[#000]' : theme === 'light' ? 'bg-slate-100/50' : 'bg-transparent'} z-10`}>
                 
                 {viewMode !== 'teleprompter' && (
                 <div className={`flex items-center justify-between px-8 py-2 shrink-0 ${zenMode ? 'pl-24' : ''}`}>
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col">
                        <span className={`text-[11px] font-black ${currentTheme.accent} uppercase tracking-widest mb-1 leading-none`}>Production Studio</span>
                        <span className="text-xl font-black truncate max-w-[320px] italic">{currentChapter.title}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      
                      <div className="flex items-center gap-1 mr-2 bg-black/5 p-1 rounded-xl">
                        <button onClick={() => undo()} disabled={pastStates.length === 0} className={`p-1.5 rounded-lg transition-all ${pastStates.length > 0 ? 'text-slate-600 hover:bg-black/10' : 'opacity-30 cursor-not-allowed text-slate-500'}`} title="撤销 (Ctrl+Z)"><Undo2 className="w-4 h-4" /></button>
                        <button onClick={() => redo()} disabled={futureStates.length === 0} className={`p-1.5 rounded-lg transition-all ${futureStates.length > 0 ? 'text-slate-600 hover:bg-black/10' : 'opacity-30 cursor-not-allowed text-slate-500'}`} title="重做 (Ctrl+Y)"><Redo2 className="w-4 h-4" /></button>
                      </div>

                      <button onClick={() => setShowSnapshotModal(true)} className={`px-3 py-2.5 rounded-xl border-2 flex items-center gap-2 text-xs font-bold transition-all ${chapterSnapshots[currentChapterId]?.length > 0 ? 'border-sky-500/30 text-sky-500 hover:bg-sky-500/10' : `border-transparent opacity-50 ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}`}><History className="w-4 h-4" /></button>
                      
                      <div className={`flex items-center p-1 rounded-xl border ${theme === 'light' ? 'bg-white border-slate-200 shadow-sm' : 'bg-black/20 border-white/10'} mr-2`}>
                         <button onClick={() => setViewMode("standard")} className={`p-1.5 rounded-lg transition-all ${viewMode === 'standard' ? 'bg-sky-500 text-white shadow-md' : 'text-slate-400 hover:bg-black/5'}`}><AlignJustify className="w-4 h-4" /></button>
                         <button onClick={() => setViewMode("chat")} className={`p-1.5 rounded-lg transition-all ${viewMode === 'chat' ? 'bg-sky-500 text-white shadow-md' : 'text-slate-400 hover:bg-black/5'}`}><MessageSquare className="w-4 h-4" /></button>
                         <button onClick={() => setViewMode("table")} className={`p-1.5 rounded-lg transition-all ${viewMode === 'table' ? 'bg-sky-500 text-white shadow-md' : 'text-slate-400 hover:bg-black/5'}`}><LayoutGrid className="w-4 h-4" /></button>
                         <button onClick={() => setViewMode("timeline")} className={`p-1.5 rounded-lg transition-all ${viewMode === 'timeline' ? 'bg-sky-500 text-white shadow-md' : 'text-slate-400 hover:bg-black/5'}`}><Clock className="w-4 h-4" /></button>
                         <div className="w-px h-4 bg-slate-500/30 mx-1" />
                         <button onClick={() => { setZenMode(true); setViewMode("teleprompter"); }} className={`p-1.5 rounded-lg transition-all text-slate-400 hover:bg-emerald-500 hover:text-white`} title="提词器模式 (Teleprompter)"><Presentation className="w-4 h-4" /></button>
                      </div>
                      <button onClick={runComplianceCheck} disabled={isProcessing || currentChapter.parsedElements.length === 0} className={`px-4 py-2.5 rounded-xl border-2 flex items-center gap-2 text-xs font-bold transition-all ${Object.keys(complianceIssues).length > 0 ? 'border-red-500 bg-red-500/10 text-red-600' : `border-transparent ${theme === 'light' ? 'bg-white shadow-sm hover:bg-slate-50' : 'bg-black/20 hover:bg-black/40'}`}`}><ShieldAlert className="w-4 h-4" /> 审查</button>
                      <button onClick={() => setShowDirectorNote(!showDirectorNote)} className={`px-4 py-2.5 rounded-xl border-2 flex items-center gap-2 text-xs font-bold transition-all ${showDirectorNote ? 'border-amber-500 bg-amber-500/10 text-amber-600' : `border-transparent ${theme === 'light' ? 'bg-white shadow-sm hover:bg-slate-50' : 'bg-black/20 hover:bg-black/40'}`}`}><Wand2 className="w-4 h-4" /> 导演批注</button>
                      <div className="flex gap-2 mr-4">
                         <button onClick={() => setWorkspaceFontSize("sm")} className={`px-2.5 py-1 rounded-md ${workspaceFontSize === 'sm' ? 'bg-sky-500 text-white' : 'bg-black/5 hover:bg-black/10'} text-xs font-bold`}>A-</button>
                         <button onClick={() => setWorkspaceFontSize("base")} className={`px-2.5 py-1 rounded-md ${workspaceFontSize === 'base' ? 'bg-sky-500 text-white' : 'bg-black/5 hover:bg-black/10'} text-sm font-bold`}>A</button>
                         <button onClick={() => setWorkspaceFontSize("lg")} className={`px-2.5 py-1 rounded-md ${workspaceFontSize === 'lg' ? 'bg-sky-500 text-white' : 'bg-black/5 hover:bg-black/10'} text-base font-bold`}>A+</button>
                       </div>
                      {isStreaming ? (
                         <button onClick={stopGeneration} className={`h-10 px-6 bg-red-500 hover:bg-red-600 rounded-xl text-sm font-black shadow-lg transition-all flex items-center justify-center gap-2 text-white shrink-0 animate-pulse`}><XOctagon className="w-4 h-4" /> 停止生成</button>
                      ) : (
                         <button disabled={isProcessing || !currentChapter.novelText} onClick={runGeneration} className={`h-10 px-6 ${currentTheme.btn} rounded-xl text-xs font-black shadow-lg hover:brightness-110 transition-all flex items-center gap-2 active:scale-95 text-white shrink-0`}>{isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4 fill-white" /> {currentChapter.parsedElements.length > 0 ? "重置生成" : "生成演播"}</>}</button>
                      )}
                    </div>
                 </div>
                 )}

                 <AnimatePresence>
                   {showDirectorNote && viewMode !== 'teleprompter' && (
                     <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className={`overflow-hidden shrink-0 px-8 pb-4`}>
                        <div className={`p-6 rounded-[2rem] border-2 border-amber-500/30 ${theme === 'light' ? 'bg-amber-50/50' : 'bg-amber-900/10'} relative backdrop-blur-md`}>
                           <div className="flex gap-2 mb-3 items-center">
                              <span className="text-[11px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2"><Wand2 className="w-3.5 h-3.5" /> 导演全局要求 (Director Note)</span>
                              <div className="ml-auto flex gap-2">
                                 <button onClick={() => updateCurrentChapter({directorNote: "采用单播风格，全部角色由旁白一人演绎，语气自然过渡，无需夸张的声线区分。不需要任何物理场景音效。"})} className="px-2 py-1 text-[11px] font-bold rounded border border-amber-500/30 text-amber-600 hover:bg-amber-500/10 transition-all">单播风格</button>
                                 <button onClick={() => updateCurrentChapter({directorNote: "采用双播风格（一男一女）。请合理分配男女角色。环境音仅保留最关键的动作音效。"})} className="px-2 py-1 text-[11px] font-bold rounded border border-amber-500/30 text-amber-600 hover:bg-amber-500/10 transition-all">双播风格</button>
                                 <button onClick={() => updateCurrentChapter({directorNote: "制作超高规格的多人广播剧。请极其详细地提取物理环境音效（如：衣物摩擦声、脚步声的材质、远处的风声）。"})} className="px-2 py-1 text-[11px] font-bold rounded border border-amber-500/30 text-amber-600 hover:bg-amber-500/10 transition-all">高拟真广播剧</button>
                              </div>
                           </div>
                           <textarea className={`w-full bg-transparent border-none outline-none resize-none h-16 text-sm font-medium placeholder:opacity-40 ${theme === 'light' ? 'text-amber-900' : 'text-amber-100'}`} placeholder="在此输入自定义情景设定或使用上方快捷模板..." value={currentChapter.directorNote || ""} onChange={(e) => updateCurrentChapter({ directorNote: e.target.value })} />
                        </div>
                     </motion.div>
                   )}
                 </AnimatePresence>

                 <div ref={splitContainerRef} className="flex-1 flex overflow-hidden relative">
                    <AnimatePresence>
                      {showSource && viewMode !== 'teleprompter' && (
                        <motion.div 
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
                          style={{ width: `${sourceWidthRatio}%` }}
                          className={`flex flex-col border ${currentTheme.border} rounded-[3rem] ${theme === 'light' ? 'bg-white/80 shadow-2xl shadow-slate-200/50' : 'bg-black/30 shadow-2xl shadow-black/40'} overflow-hidden shrink-0 relative backdrop-blur-xl z-50`}
                        >
                           <div className={`px-6 py-3 border-b ${currentTheme.border} flex justify-between items-center ${theme === 'light' ? 'bg-slate-50/50' : 'bg-black/40'} shrink-0`}>
                              <span className="text-[11px] font-black opacity-40 uppercase tracking-[0.2em] italic">Original Asset</span>
                              <button onClick={() => setShowSource(false)} className={`p-1.5 rounded-xl transition-all ${theme === 'light' ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-slate-400'}`}><EyeOff className="w-4 h-4" /></button>
                           </div>
                           <div 
                             ref={sourceScrollRef} 
                             onScroll={handleSourceScroll} 
                             onMouseEnter={() => scrollLeaderRef.current = 'source'}
                             onMouseLeave={() => scrollLeaderRef.current = null}
                             className="flex-1 p-10 pt-6 overflow-y-auto scrollbar-hide space-y-6 relative"
                           >
                             {currentChapter.novelText.split("\n").filter(p => p.trim()).map((para, pIdx) => (
                               <p key={pIdx} 
                                 className={`${fontSizeClass[workspaceFontSize]} leading-relaxed transition-all duration-700 font-medium italic ${syncScroll ? 'opacity-30 hover:opacity-100 [&.active]:opacity-100 [&.active]:text-sky-500 [&.active]:font-black [&.active]:scale-[1.02] origin-left relative' : 'opacity-80'}`}
                               >
                                 <span className="absolute -right-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-sky-500 opacity-0 [.active_&]:opacity-100 transition-opacity" />
                                 {para}
                               </p>
                             ))}
                           </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {showSource && viewMode !== 'teleprompter' && (
                       <div onMouseDown={(e) => { e.preventDefault(); setIsDraggingSplitter(true); }} className={`w-6 flex items-center justify-center cursor-col-resize shrink-0 z-[70] group`}>
                         <div className={`h-16 w-1 rounded-full transition-all ${isDraggingSplitter ? 'bg-sky-500 w-1.5' : 'bg-slate-500/20 group-hover:bg-sky-500/50'}`} />
                       </div>
                    )}
                    
                    <div className={`flex-1 flex flex-col ${viewMode === 'teleprompter' ? 'border-none rounded-none bg-black' : `border ${theme === 'light' ? 'border-sky-200 shadow-sky-100/30 bg-white/90' : 'border-sky-500/20 shadow-sky-950/20 bg-slate-900/40'} rounded-[3rem]`} shadow-2xl overflow-hidden relative backdrop-blur-xl z-50`} onMouseEnter={() => scrollLeaderRef.current = 'script'} onMouseLeave={() => scrollLeaderRef.current = null}>
                       {viewMode !== 'teleprompter' && (
                       <div className={`px-8 py-4 border-b ${theme === 'light' ? 'border-sky-50 bg-sky-50/50' : 'border-sky-500/10 bg-sky-950/30'} flex justify-between items-center shrink-0`}>
                          <div className="flex items-center gap-3">
                             {!showSource && <button onClick={() => setShowSource(true)} className={`p-2 rounded-xl transition-all ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-black/20 hover:bg-white/10 text-slate-300'}`}><Eye className="w-5 h-5" /></button>}
                             <button onClick={startContinuousPlay} disabled={currentChapter.parsedElements.length === 0} className={`px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-black shadow-sm transition-all ${isAutoPlaying ? 'bg-amber-500 text-white shadow-amber-500/20 animate-pulse' : theme === 'light' ? 'bg-sky-100 text-sky-700 hover:bg-sky-200' : 'bg-sky-500/20 text-sky-400 hover:bg-sky-500/30'}`}>{isAutoPlaying ? <Pause className="w-4 h-4 fill-current" /> : <FastForward className="w-4 h-4 fill-current" />}{isAutoPlaying ? '暂停连播' : '全文连播'}</button>
                             
                             <div className={`h-8 px-3 rounded-xl flex items-center gap-2 transition-all ${theme === 'light' ? 'bg-white border border-slate-200 text-slate-600' : 'bg-black/20 border border-white/10 text-slate-300'}`} title="BGM 链接">
                                <Music className={`w-3.5 h-3.5 ${currentChapter.bgmUrl ? 'text-sky-500' : 'opacity-40'}`} />
                                <input placeholder="环境底噪 (BGM URL)" value={currentChapter.bgmUrl || ""} onChange={e => updateCurrentChapter({ bgmUrl: e.target.value })} className="bg-transparent border-none outline-none text-[11px] font-bold w-32 placeholder:opacity-40" />
                             </div>

                             <div className="flex items-center gap-2 px-3 py-1.5 bg-sky-500/10 rounded-full border border-sky-500/20 cursor-pointer hover:bg-sky-500/20 transition-all" onClick={() => setSyncScroll(!syncScroll)}>
                                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${syncScroll ? 'bg-sky-500' : 'bg-black/20'}`}>{syncScroll && <Check className="w-2.5 h-2.5 text-white" />}</div><span className="text-[10px] font-black text-sky-500 uppercase tracking-widest ml-1 select-none">Sync Scroll</span>
                             </div>
                          </div>
                          <div className="flex items-center gap-4">
                             {isStreaming && <span className="flex items-center gap-2 text-[11px] font-black text-sky-500 uppercase tracking-widest"><Loader2 className="w-3 h-3 animate-spin" /> Streaming...</span>}
                             <span className="text-[11px] font-black opacity-40 uppercase tracking-[0.2em]">Chapter Nodes: {currentChapter.parsedElements.length}</span>
                          </div>
                       </div>
                       )}

                       <div className="flex-1 flex overflow-hidden relative">
                         {viewMode === 'timeline' ? (
                           <div className={`flex-1 overflow-x-auto overflow-y-hidden p-8 custom-scrollbar ${theme === 'light' ? 'bg-slate-50/50' : 'bg-black/10'}`}>
                             <div className="relative h-64 flex flex-col justify-between w-max min-w-full px-8 py-4">
                                <div className="absolute inset-0 border-b border-dashed border-slate-500/20 top-[33%]" />
                                <div className="absolute inset-0 border-b border-dashed border-slate-500/20 top-[66%]" />
                                
                                <div className="flex items-center gap-1 h-full relative z-10">
                                   {currentChapter.parsedElements.map((el, index) => {
                                      const isActive = playingId === el.id || hoveredCardIndex === index;
                                      const estimatedDuration = el.content.length * 8 + (el.audioConfig?.pauseAfter || 400) / 5;
                                      const cardWidth = Math.min(Math.max(220, estimatedDuration), 600);

                                      return (
                                        <React.Fragment key={el.id}>
                                           <div 
                                              className={`flex flex-col h-full shrink-0 transition-all duration-300 ${el.type === 'narration' ? 'justify-start' : el.type === 'sound_effect' ? 'justify-end' : 'justify-center'}`}
                                              style={{ width: `${cardWidth}px` }}
                                            >
                                              <div 
                                                onClick={() => { setHoveredCardIndex(index); applyHighlights(index); }}
                                                onDoubleClick={() => { setEditingElementId(el.id); setViewMode('standard'); }}
                                                className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-lg
                                                   ${el.type === 'sound_effect' ? 'bg-amber-900/40 border-amber-500/30 text-amber-100' : el.type === 'narration' ? 'bg-slate-800/60 border-slate-600/50 text-slate-200' : 'bg-sky-900/40 border-sky-500/30 text-sky-100'}
                                                   ${isActive ? 'ring-2 ring-white scale-[1.02] brightness-125' : 'hover:brightness-110'}
                                                `}
                                              >
                                                 <div className="flex justify-between items-center mb-2">
                                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60 truncate mr-2">{el.speaker || (el.type==='narration'?'旁白':'音效')}</span>
                                                    <button onClick={(e) => { e.stopPropagation(); handleSingleTTSPlay(el.content, el.id, el.speaker, index); }} className="p-1 hover:text-sky-400 shrink-0">
                                                      {playingId === el.id ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                                                    </button>
                                                 </div>
                                                 <div className="text-xs font-medium opacity-90 break-words line-clamp-4">{el.content || el.meta}</div>
                                              </div>
                                           </div>
                                           <div className="flex flex-col items-center justify-center w-8 group hover:w-20 transition-all shrink-0 z-20">
                                              <span className="text-[10px] font-mono text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity mb-1 whitespace-nowrap">
                                                {el.audioConfig?.pauseAfter || 400}ms
                                              </span>
                                              <input 
                                                type="range" min="0" max="3000" step="100"
                                                value={el.audioConfig?.pauseAfter || 400}
                                                onChange={(e) => updateScriptElement(el.id, { audioConfig: { ...el.audioConfig, pauseAfter: parseInt(e.target.value) } })}
                                                className="w-full accent-indigo-500 h-1.5 bg-indigo-500/20 rounded-full appearance-none cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
                                              />
                                           </div>
                                        </React.Fragment>
                                      )
                                   })}
                                </div>
                             </div>
                           </div>
                         ) : (
                           <Virtuoso
                              ref={virtuosoRef} 
                              data={currentChapter.parsedElements} 
                              className={`flex-1 scrollbar-hide ${viewMode === 'table' ? 'py-2' : viewMode === 'teleprompter' ? 'py-[30vh]' : 'p-8'}`}
                              rangeChanged={(range) => {
                                if (scrollLeaderRef.current !== 'script' || !syncScroll || isAutoPlayingRef.current || viewMode === 'teleprompter') return;
                                const midIdx = Math.floor((range.startIndex + range.endIndex) / 2);
                                setHoveredCardIndex(midIdx); applyHighlights(midIdx);
                                const src = sourceScrollRef.current;
                                if (src) { 
                                  const activeP = src.querySelector('p.active') as HTMLElement; 
                                  if (activeP) src.scrollTo({ top: activeP.offsetTop - src.clientHeight / 2 + activeP.clientHeight / 2, behavior: 'auto' }); 
                                }
                              }}
                              itemContent={(index, el) => (
                                  <ScriptCard 
                                    key={el.id} element={el} index={index} totalElements={currentChapter.parsedElements.length}
                                    isActive={playingId === el.id || hoveredCardIndex === index}
                                    isCompliantIssue={complianceIssues[el.id] || null} characters={characters} theme={theme}
                                    workspaceFontSize={workspaceFontSize} emotionGlowColor={emotionData[index]?.color}
                                    syncScroll={syncScroll} playingId={playingId} editingElementId={editingElementId}
                                    inlineRewriteId={inlineRewriteId} inlineRewritePrompt={inlineRewritePrompt}
                                    viewMode={viewMode} pendingDiff={pendingDiffs[el.id] || null}
                                    onAcceptDiff={acceptDiff} onRejectDiff={rejectDiff}
                                    onHover={(idx) => { if (!syncScroll || isAutoPlayingRef.current || viewMode === 'teleprompter') return; setHoveredCardIndex(idx); if (idx !== null) applyHighlights(idx); }}
                                    onPlay={handleSingleTTSPlay} onEdit={setEditingElementId}
                                    onRewriteStart={(id) => { setInlineRewriteId(id); setInlineRewritePrompt(""); }}
                                    onRewriteCancel={() => setInlineRewriteId(null)} onRewriteSubmit={handleInlineRewrite}
                                    onRewritePromptChange={setInlineRewritePrompt} onUpdateElement={updateScriptElement}
                                    onSplitElement={handleSplitElement} onMergeUpElement={handleMergeUpElement}
                                    onMergeDownElement={handleMergeDownElement} onReorder={reorderScriptElements} onDeleteElement={deleteScriptElement}
                                  />
                              )}
                           />
                         )}

                         {currentChapter.parsedElements.length === 0 && !isStreaming && (
                           <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 opacity-[0.03] grayscale pointer-events-none">
                              <PlayCircle className="w-48 h-48 stroke-[1px]" /><p className="text-2xl font-black uppercase tracking-[1.5em] leading-none ml-[1.5em] text-current">Ready</p>
                           </div>
                         )}
                       </div>
                    </div>
                 </div> 
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* ============================================================================ */}
        {/* 全局播放控制台 & 实时可视化波形 (Global Playback Bar)                          */}
        {/* ============================================================================ */}
        <AnimatePresence>
          {(playingId || auditioningId) && (
            <motion.div 
               initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
               className="absolute bottom-0 left-0 w-full h-16 z-[500] backdrop-blur-3xl border-t shadow-[0_-10px_40px_rgba(0,0,0,0.1)] flex items-center px-6 gap-6"
               style={{ 
                 background: theme === 'light' ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)',
                 borderColor: theme === 'light' ? 'rgba(226,232,240,0.8)' : 'rgba(51,65,85,0.8)'
               }}
            >
              <div className="flex items-center gap-4 shrink-0">
                 <button onClick={stopAllAudio} className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all ${theme === 'light' ? 'bg-sky-500 text-white' : 'bg-sky-400 text-slate-900'}`}>
                    <Square className="w-4 h-4 fill-current" />
                 </button>
                 <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Now Playing</span>
                    <span className="text-sm font-bold truncate max-w-[120px]">
                      {auditioningId ? characters.find(c => c.id === auditioningId)?.name : currentChapter.parsedElements.find(e => e.id === playingId)?.speaker || "旁白 / 音效"}
                    </span>
                 </div>
              </div>

              {/* 实时波形画布 */}
              <div className="flex-1 h-10 bg-black/5 rounded-xl overflow-hidden relative opacity-80">
                 <canvas ref={visualizerCanvasRef} width="800" height="40" className="w-full h-full" />
              </div>

              <div className="w-1/3 shrink-0 flex items-center justify-end">
                 <div className="text-xs font-medium truncate opacity-60">
                   {auditioningId ? "音色试听中 (Audition)..." : currentChapter.parsedElements.find(e => e.id === playingId)?.content || "..."}
                 </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* Global Command Palette (Cmd + K) */}
      {cmdKOpen && createPortal(
        <div className={`fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] p-6 bg-black/60 backdrop-blur-sm ${currentTheme.text}`} onClick={() => setCmdKOpen(false)}>
          <div className={`w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border flex flex-col ${theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'}`} onClick={e => e.stopPropagation()}>
            <div className={`flex border-b ${theme === 'light' ? 'border-slate-200' : 'border-slate-800'}`}>
               <button onClick={() => setCmdKMode('commands')} className={`flex-1 py-3 text-sm font-black transition-all ${cmdKMode === 'commands' ? 'border-b-2 border-sky-500 text-sky-500' : `opacity-50 hover:opacity-100 ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}`}>Command Palette</button>
               <button onClick={() => setCmdKMode('replace')} className={`flex-1 py-3 text-sm font-black transition-all ${cmdKMode === 'replace' ? 'border-b-2 border-sky-500 text-sky-500' : `opacity-50 hover:opacity-100 ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}`}>Search & Replace</button>
            </div>
            {cmdKMode === 'commands' ? (
              <>
                <div className="p-4 flex items-center gap-3 border-b border-slate-500/20">
                  <Command className="w-5 h-5 text-sky-500" />
                  <input ref={cmdKInputRef} value={cmdKSearch} onChange={e => setCmdKSearch(e.target.value)} placeholder="键入以搜索命令 (Search for commands...)" className={`flex-1 bg-transparent border-none outline-none text-lg font-black placeholder:opacity-30 ${theme === 'light' ? 'text-slate-900' : 'text-white'}`} />
                </div>
                <div className="max-h-96 overflow-y-auto p-2">
                  {filteredCommands.length === 0 ? <div className="py-8 text-center text-sm font-bold opacity-40">暂无匹配的快捷命令</div> : filteredCommands.map((cmd) => (
                      <button key={cmd.id} onClick={() => { cmd.action(); setCmdKOpen(false); setCmdKSearch(""); }} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-black transition-all ${theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>
                        <cmd.icon className="w-4 h-4 opacity-50" /><span>{cmd.label}</span>
                      </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="p-8 space-y-6">
                <div className="flex flex-col gap-2"><label className="text-[11px] font-black uppercase tracking-widest opacity-50">Find / 查找词</label><input ref={cmdKInputRef} value={cmdKSearch} onChange={e => setCmdKSearch(e.target.value)} className={`w-full px-4 py-3 rounded-xl border transition-all text-sm font-bold ${theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-black/20 border-white/10 text-white'} outline-none focus:border-sky-500`} placeholder="输入需要批量替换的文字..." /></div>
                <div className="flex flex-col gap-2"><label className="text-[11px] font-black uppercase tracking-widest opacity-50">Replace With / 替换为</label><input value={replaceTarget} onChange={e => setReplaceTarget(e.target.value)} className={`w-full px-4 py-3 rounded-xl border transition-all text-sm font-bold ${theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-black/20 border-white/10 text-white'} outline-none focus:border-sky-500`} placeholder="输入修正后的结果..." /></div>
                <button onClick={handleGlobalReplace} disabled={!cmdKSearch || !replaceTarget} className={`w-full py-4 rounded-xl font-black text-sm flex justify-center items-center gap-2 transition-all ${!cmdKSearch || !replaceTarget ? 'opacity-50 cursor-not-allowed bg-slate-500 text-white' : 'bg-sky-500 hover:bg-sky-600 text-white shadow-lg'}`}><ReplaceAll className="w-4 h-4" /> 替换当前章节所有匹配项</button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Snapshot 回滚模态框 */}
      {showSnapshotModal && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onClick={() => setShowSnapshotModal(false)}>
           <div className={`w-full max-w-3xl rounded-[3rem] p-10 shadow-2xl relative overflow-hidden ${theme === 'light' ? 'bg-white text-slate-900' : 'bg-slate-900 text-white border border-white/10'}`} onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-8">
                 <div><h2 className="text-3xl font-black italic tracking-tighter">Time Machine</h2></div>
                 <button onClick={() => setShowSnapshotModal(false)} className="w-10 h-10 flex items-center justify-center bg-black/5 hover:bg-black/10 rounded-full transition-all"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 scrollbar-hide">
                 {!chapterSnapshots[currentChapterId] || chapterSnapshots[currentChapterId].length === 0 ? (
                    <div className="py-12 text-center text-sm font-bold opacity-40">当前章节尚无自动保存的快照</div>
                 ) : (
                    chapterSnapshots[currentChapterId].map((snap, idx) => (
                      <div key={snap.id} className={`p-5 rounded-2xl border flex items-center justify-between ${idx === 0 ? 'border-sky-500/30 bg-sky-500/5' : `border-transparent ${theme === 'light' ? 'bg-slate-50' : 'bg-white/5'}`}`}>
                         <div><div className="text-sm font-bold">{snap.summary}</div></div>
                         <button onClick={() => restoreSnapshot(snap)} className={`px-5 py-2.5 rounded-xl text-xs font-black shadow-md transition-all active:scale-95 flex items-center gap-2 ${theme === 'light' ? 'bg-slate-900 text-white hover:bg-sky-600' : 'bg-white text-slate-900 hover:bg-sky-400'}`}><History className="w-3.5 h-3.5" /> 恢复</button>
                      </div>
                    ))
                 )}
              </div>
           </div>
        </div>,
        document.body
      )}

      {/* Characters Edit Modal */}
      {editingCharId && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onClick={() => setEditingCharId(null)}>
           <div className={`w-full max-w-2xl rounded-[4rem] p-16 shadow-2xl relative overflow-hidden ${theme === 'light' ? 'bg-white text-slate-900' : 'bg-slate-900 text-white border border-white/10'}`} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setEditingCharId(null)} className="absolute top-8 right-8 z-10 w-10 h-10 flex items-center justify-center bg-black/5 hover:bg-black/10 rounded-full transition-all text-current"><Plus className="w-8 h-8 rotate-45" /></button>
              <h2 className="text-4xl font-black italic mb-12 tracking-tighter">Edit Persona / 精修建模</h2>
              <div className="space-y-8">
                 <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3"><label className="text-[10px] font-black opacity-40 uppercase tracking-[0.3em] ml-2">Display Name</label><input className={`w-full border rounded-[2rem] p-5 text-sm font-black focus:border-sky-500 outline-none transition-all ${theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-black/40 border-white/5 text-white'}`} value={characters.find(c => c.id === editingCharId)?.name} onChange={e => setCharacters(characters.map(c => c.id === editingCharId ? { ...c, name: e.target.value } : c))} /></div>
                    <div className="space-y-3"><label className="text-[10px] font-black opacity-40 uppercase tracking-[0.3em] ml-2">Type Guard (Gender/Age)</label><input className={`w-full border rounded-[2rem] p-5 text-sm font-black focus:border-sky-500 outline-none transition-all ${theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-black/40 border-white/5 text-white'}`} value={`${characters.find(c => c.id === editingCharId)?.gender}/${characters.find(c => c.id === editingCharId)?.age}`} onChange={e => { const parts = e.target.value.split("/"); const g = parts[0] || ""; const a = parts[1] || ""; setCharacters(characters.map(c => c.id === editingCharId ? { ...c, gender: g, age: a } : c)); }} /></div>
                 </div>
                 <div className="space-y-3">
                    <label className="text-[10px] font-black opacity-40 uppercase tracking-[0.3em] ml-2 flex items-center justify-between">Edge TTS / ElevenLabs Voice ID</label>
                    <select 
                      className={`w-full border rounded-[2rem] p-5 text-sm font-mono font-bold focus:border-sky-500 outline-none transition-all ${theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-black/40 border-white/5 text-white'}`} 
                      value={characters.find(c => c.id === editingCharId)?.voiceId || ""} 
                      onChange={e => setCharacters(characters.map(c => c.id === editingCharId ? { ...c, voiceId: e.target.value } : c))}
                    >
                      <option value="">-- 未设置 (默认) --</option>
                      <optgroup label="内置优选微软音色库">
                        {EDGE_VOICES_CATALOG.map(v => <option key={v.id} value={v.id}>{v.id} ({v.desc})</option>)}
                      </optgroup>
                      <optgroup label="自定义 ID (手动输入支持)"></optgroup>
                    </select>
                    <input className={`w-full mt-2 border rounded-xl p-3 text-xs font-mono focus:border-sky-500 outline-none transition-all ${theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-black/40 border-white/5 text-white'}`} placeholder="或在此手动输入自定义的 Voice ID" value={characters.find(c => c.id === editingCharId)?.voiceId || ""} onChange={e => setCharacters(characters.map(c => c.id === editingCharId ? { ...c, voiceId: e.target.value } : c))} />
                 </div>
                 <div className="space-y-3"><label className="text-[10px] font-black opacity-40 uppercase tracking-[0.3em] ml-2">Actor Profile Instruction</label><textarea className={`w-full h-32 border rounded-[2.5rem] p-6 text-sm resize-none scrollbar-hide focus:border-sky-500 outline-none transition-all leading-relaxed ${theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-black/40 border-white/5 text-white'}`} value={characters.find(c => c.id === editingCharId)?.description} onChange={e => setCharacters(characters.map(c => c.id === editingCharId ? { ...c, description: e.target.value } : c))} /></div>
              </div>
              <button onClick={() => setEditingCharId(null)} className={`w-full h-16 ${theme === 'light' ? 'bg-slate-900 text-white' : 'bg-white text-slate-950'} rounded-[2.5rem] mt-8 font-black shadow-2xl transition-all uppercase tracking-widest text-sm hover:translate-y-[-4px]`}>Submit Refinement</button>
           </div>
        </div>,
        document.body
      )}

      {/* Settings Modal */}
      {showSettingsModal && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onClick={() => setShowSettingsModal(false)}>
           <div className={`w-full max-w-4xl flex flex-col rounded-[2.5rem] p-8 lg:p-10 shadow-2xl relative max-h-[90vh] overflow-y-auto scrollbar-hide ${theme === 'light' ? 'bg-white text-slate-900' : 'bg-slate-900 text-white border border-white/10'}`} onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-8">
                 <div><h2 className="text-3xl font-black italic tracking-tighter">Settings / 全局配置</h2></div>
                 <button onClick={() => setShowSettingsModal(false)} className="w-10 h-10 flex items-center justify-center bg-black/5 hover:bg-black/10 rounded-full transition-all"><Plus className="w-6 h-6 rotate-45" /></button>
              </div>

              <div className="space-y-6">
                
                <div className={`p-6 rounded-[1.5rem] border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                   <div className="flex items-center gap-3 mb-5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme === 'light' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-indigo-500 text-white'}`}><Sparkles className="w-5 h-5" /></div>
                      <div><h3 className="font-black text-lg">AI Model / 推理大模型</h3></div>
                   </div>
                   <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                     {[
                       // === 海外主流大模型 ===
                       { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite", desc: "速度极快" },
                       { id: "gemini-3-flash-preview", name: "Gemini 3.0 Flash", desc: "均衡/日常首选" },
                       { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", desc: "高复杂推理" },
                       { id: "claude-3-7-sonnet-latest", name: "Claude 3.7 Sonnet", desc: "代码与长文增强" },
                       { id: "gpt-4o", name: "GPT-4o", desc: "综合能力强" },
                       { id: "deepseek-chat", name: "DeepSeek V3", desc: "平价长文本" },
                       // === 国产大模型 ===
                       { id: "qwen-max", name: "通义千问 Max", desc: "阿里旗舰" },
                       { id: "doubao-pro-32k", name: "字节豆包 Pro", desc: "字节跳动" },
                       { id: "glm-4-plus", name: "智谱 GLM-4", desc: "智谱AI" },
                       { id: "ernie-4.0-8k", name: "文心一言 4.0", desc: "百度旗舰" },
                       { id: "hunyuan-pro", name: "腾讯混元 Pro", desc: "腾讯旗舰" },
                       { id: "spark-v4.0", name: "讯飞星火 V4", desc: "科大讯飞" },
                       { id: "abab6.5s-chat", name: "Minimax", desc: "高情商表现" },
                       { id: "step-2-16k", name: "阶跃星辰", desc: "StepFun" },
                     ].map(m => (
                       <button 
                         key={m.id} 
                         onClick={() => setSelectedModel(m.id)} 
                         className={`text-left p-4 flex flex-col gap-1 rounded-xl border-2 transition-all ${selectedModel === m.id ? 'border-sky-500 bg-sky-500/10 shadow-md' : `border-transparent ${theme === 'light' ? 'bg-white shadow-sm hover:shadow-md' : 'bg-black/20 hover:bg-black/40'}`}`}
                       >
                         <span className="font-black text-[13px] break-all">{m.name}</span>
                         <span className="font-bold text-[10px] opacity-60">{m.desc}</span>
                       </button>
                     ))}
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-dashed border-indigo-500/20">
                     <div className="flex flex-col gap-2"><label className="text-[10px] font-black uppercase tracking-widest opacity-50">API 协议格式</label><select value={localApiFormat} onChange={(e) => setLocalApiFormat(e.target.value)} className={`w-full px-4 py-3 rounded-xl border transition-all text-sm font-bold ${theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-black/20 border-white/10 text-white'} outline-none`}><option value="gemini">Google Gemini 官方/代理</option><option value="openai">OpenAI 兼容</option></select></div>
                     <div className="flex flex-col gap-2"><label className="text-[10px] font-black uppercase tracking-widest opacity-50">API Base URL</label><input type="text" placeholder="https://api.deepseek.com/v1" value={localBaseUrl} onChange={(e) => setLocalBaseUrl(e.target.value)} className={`w-full px-4 py-3 rounded-xl border transition-all text-sm font-mono ${theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-black/20 border-white/10 text-white'} outline-none`} /></div>
                     <div className="flex flex-col gap-2"><label className="text-[10px] font-black uppercase tracking-widest opacity-50">Custom API Key</label><input type="password" placeholder="填入 API Key" value={localApiKey} onChange={(e) => setLocalApiKey(e.target.value)} className={`w-full px-4 py-3 rounded-xl border transition-all text-sm font-mono ${theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-black/20 border-white/10 text-white'} outline-none`} /></div>
                     <div className="flex flex-col gap-2"><label className="text-[10px] font-black uppercase tracking-widest opacity-50">自定义特定模型名</label><input type="text" placeholder="如 deepseek-chat" value={localCustomModel} onChange={(e) => setLocalCustomModel(e.target.value)} className={`w-full px-4 py-3 rounded-xl border transition-all text-sm font-mono ${theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-black/20 border-white/10 text-white'} outline-none`} /></div>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className={`p-6 rounded-[1.5rem] border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                     <div className="flex items-center gap-3 mb-5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme === 'light' ? 'bg-pink-500/10 text-pink-500' : 'bg-pink-500 text-white'}`}><Volume2 className="w-5 h-5" /></div>
                        <div><h3 className="font-black text-lg">ElevenLabs (付费版)</h3><p className="text-[11px] opacity-60 font-bold leading-tight">超高拟真度，支持语音克隆。</p></div>
                     </div>
                     <div className="flex flex-col gap-2">
                       <label className="text-[10px] font-black uppercase tracking-widest opacity-50">API Key</label>
                       <input type="password" placeholder="xi-api-key..." value={elevenLabsApiKey} onChange={(e) => setElevenLabsApiKey(e.target.value)} className={`w-full px-4 py-3 rounded-xl border transition-all text-sm font-mono ${theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-black/20 border-white/10 text-white'} outline-none`} />
                     </div>
                  </div>
                  
                  <div className={`p-6 rounded-[1.5rem] border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                     <div className="flex items-center gap-3 mb-5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme === 'light' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-emerald-500 text-white'}`}><Headphones className="w-5 h-5" /></div>
                        <div><h3 className="font-black text-lg">Edge TTS (免费版)</h3><p className="text-[11px] opacity-60 font-bold leading-tight">微软免费音色，需部署本地代理。</p></div>
                     </div>
                     <div className="flex flex-col gap-2">
                       <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Proxy URL</label>
                       <input type="text" placeholder="http://localhost:3000/api/tts" value={edgeTtsProxyUrl} onChange={(e) => setEdgeTtsProxyUrl(e.target.value)} className={`w-full px-4 py-3 rounded-xl border transition-all text-sm font-mono ${theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-black/20 border-white/10 text-white'} outline-none`} />
                     </div>
                  </div>
                </div>

                <div className={`p-6 rounded-[1.5rem] border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                   <div className="flex items-center gap-3 mb-5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme === 'light' ? 'bg-amber-500/10 text-amber-500' : 'bg-amber-500 text-white'}`}><BookOpen className="w-5 h-5" /></div>
                      <div><h3 className="font-black text-lg">Global Pronunciation / 全局发音词典</h3><p className="text-xs opacity-60 font-bold">在此配置的多音字或生僻字，将自动应用于项目中所有音频合成。</p></div>
                   </div>
                   <div className="flex flex-col gap-4">
                      <div className="flex gap-2">
                        <input value={newGlobalWord} onChange={e => setNewGlobalWord(e.target.value)} placeholder="原词 (如:重阳)" className={`flex-1 px-4 py-3 rounded-xl border outline-none text-sm font-bold ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-black/20 border-white/10'}`} />
                        <input value={newGlobalPinyin} onChange={e => setNewGlobalPinyin(e.target.value)} placeholder="拼音 (如:虫阳)" className={`flex-1 px-4 py-3 rounded-xl border outline-none text-sm font-bold ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-black/20 border-white/10'}`} />
                        <button onClick={() => { if(newGlobalWord && newGlobalPinyin) { setGlobalPronunciations({ ...globalPronunciations, [newGlobalWord]: newGlobalPinyin }); setNewGlobalWord(""); setNewGlobalPinyin(""); } }} className="px-6 bg-amber-500 text-white rounded-xl font-black hover:bg-amber-600 transition-all shadow-md">添加</button>
                      </div>
                      {Object.keys(globalPronunciations).length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {Object.entries(globalPronunciations).map(([word, py]) => (
                            <div key={word} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-black border ${theme === 'light' ? 'bg-white border-amber-200 text-amber-700' : 'bg-black/40 border-amber-500/30 text-amber-300'}`}>
                              <span>{word} &rarr; {py}</span>
                              <button onClick={() => { const newDict = {...globalPronunciations}; delete newDict[word]; setGlobalPronunciations(newDict); }} className="opacity-50 hover:opacity-100 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                   </div>
                </div>

                {/* 清除缓存按钮 */}
                <button onClick={async () => { await audioDb.cache.clear(); setShowSaveToast(true); setTimeout(() => setShowSaveToast(false), 2000); }} className={`w-full py-4 rounded-xl border-2 border-red-500/20 text-red-500 font-bold hover:bg-red-500/10 transition-all flex justify-center items-center gap-2`}>
                   <Trash2 className="w-4 h-4" /> 清空本地 TTS 语音高速缓存
                </button>

              </div>
           </div>
        </div>,
        document.body
      )}

      {/* Export Modal */}
      {showExportModal && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onClick={() => setShowExportModal(false)}>
           <div className={`w-full max-w-xl flex flex-col rounded-[2rem] p-8 shadow-2xl relative ${theme === 'light' ? 'bg-white text-slate-900' : 'bg-slate-900 text-white border border-white/10'}`} onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-8"><h2 className="text-2xl font-black italic tracking-tighter">Export Script</h2><button onClick={() => setShowExportModal(false)} className="w-10 h-10 flex items-center justify-center bg-black/5 hover:bg-black/10 rounded-full transition-all"><Plus className="w-6 h-6 rotate-45" /></button></div>
              <div className="mb-6"><label className="block text-xs font-black mb-3 opacity-60 uppercase tracking-widest">Scope / 导出范围</label>
                <div className="flex gap-3">
                  <button onClick={() => setExportScope('single')} className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold transition-all ${exportScope === 'single' ? 'border-sky-500 text-sky-500 bg-sky-500/10' : `border-transparent ${theme === 'light' ? 'bg-slate-100 text-slate-600' : 'bg-white/5 text-slate-400'}`}`}>当前章节</button>
                  <button onClick={() => setExportScope('all')} className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold transition-all ${exportScope === 'all' ? 'border-sky-500 text-sky-500 bg-sky-500/10' : `border-transparent ${theme === 'light' ? 'bg-slate-100 text-slate-600' : 'bg-white/5 text-slate-400'}`}`}>全本合并</button>
                </div>
              </div>
              <div className="mb-8"><label className="block text-xs font-black mb-3 opacity-60 uppercase tracking-widest">Format / 文件格式</label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setExportFormat('excel')} className={`col-span-2 text-left flex items-center justify-between p-4 rounded-xl border-2 transition-all ${exportFormat === 'excel' ? 'border-emerald-500 bg-emerald-500/10' : `border-transparent ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200' : 'bg-white/5 hover:bg-white/10'}`}`}>
                    <div className="flex items-center gap-4"><div className={`p-2 rounded-lg ${exportFormat === 'excel' ? 'bg-emerald-500 text-white' : 'bg-black/10'}`}><FileSpreadsheet className="w-5 h-5" /></div><div><div className="font-bold">配音表格 (.xlsx)</div></div></div>
                  </button>
                  <button onClick={() => setExportFormat('audio')} className={`col-span-2 text-left flex items-center justify-between p-4 rounded-xl border-2 transition-all ${exportFormat === 'audio' ? 'border-indigo-500 bg-indigo-500/10' : `border-transparent ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200' : 'bg-white/5 hover:bg-white/10'}`}`}>
                    <div className="flex items-center gap-4"><div className={`p-2 rounded-lg ${exportFormat === 'audio' ? 'bg-indigo-500 text-white' : 'bg-black/10'}`}><Headphones className="w-5 h-5" /></div><div><div className="font-bold">纯前端整轨闪避混音 (.wav)</div></div></div>
                  </button>
                  <button onClick={() => setExportFormat('word')} className={`text-left p-4 rounded-xl border-2 transition-all ${exportFormat === 'word' ? 'border-sky-500 bg-sky-500/10' : `border-transparent ${theme === 'light' ? 'bg-slate-100' : 'bg-white/5'}`} font-bold text-sm`}>Word (.doc)</button>
                  <button onClick={() => setExportFormat('txt')} className={`text-left p-4 rounded-xl border-2 transition-all ${exportFormat === 'txt' ? 'border-amber-500 bg-amber-500/10' : `border-transparent ${theme === 'light' ? 'bg-slate-100' : 'bg-white/5'}`} font-bold text-sm`}>纯文本 (.txt)</button>
                </div>
              </div>
              <button onClick={executeExport} disabled={isProcessing} className={`w-full py-4 rounded-xl font-black shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${theme === 'light' ? 'bg-slate-900 text-white hover:bg-sky-600' : 'bg-sky-500 text-white hover:bg-sky-400'}`}>
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />} 
                立即导出 (Execute Export)
              </button>
           </div>
        </div>,
        document.body
      )}

      {/* Audio Export Progress Overlay */}
      {audioExportProgress && createPortal(
        <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
           <div className="w-96 p-8 rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl text-center">
             <Headphones className="w-12 h-12 text-indigo-500 mx-auto mb-6 animate-pulse" />
             <h3 className="text-xl font-black text-white mb-2 tracking-widest uppercase">Audio Mixdown</h3>
             <p className="text-sm font-bold text-slate-400 mb-6 h-6">{audioExportProgress.status}</p>
             <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(audioExportProgress.current / audioExportProgress.total) * 100}%` }} />
             </div>
             <p className="text-xs font-mono text-indigo-400">{audioExportProgress.current} / {audioExportProgress.total} Nodes Processed</p>
           </div>
        </div>,
        document.body
      )}

      {/* Project Vault Modal */}
      {showProjectModal && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onClick={() => setShowProjectModal(false)}>
           <div className={`w-full max-w-6xl h-[85vh] flex flex-col rounded-[3rem] p-10 lg:p-12 shadow-2xl relative overflow-hidden ${theme === 'light' ? 'bg-white text-slate-900' : 'bg-slate-900 text-white border border-white/10'}`} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setShowProjectModal(false)} className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center bg-black/5 hover:bg-black/10 rounded-full transition-all z-10 text-current"><Plus className="w-8 h-8 rotate-45" /></button>
              <div className="flex justify-between items-start mb-12">
                <div>
                  <h2 className="text-4xl font-black italic tracking-tighter leading-none mb-3">Vault / 项目中台</h2>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveAsProject} className={`px-5 py-3 ${theme === 'light' ? 'bg-amber-500' : 'bg-amber-600'} rounded-xl text-[11px] font-black text-white flex items-center gap-2 hover:translate-y-[-2px] transition-all shadow-xl`}><Copy className="w-3.5 h-3.5" /> 另存新项目</button>
                  <label className={`cursor-pointer px-5 py-3 ${theme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-900' : 'bg-black/40 border-white/5 text-white'} border rounded-xl text-[11px] font-black flex items-center gap-2 hover:bg-sky-500 hover:text-white transition-all shadow-lg active:translate-y-0.5`}>
                    <Upload className="w-3.5 h-3.5" /> 导入项目
                    <input type="file" accept=".json" className="hidden" onChange={handleImportProject} />
                  </label>
                  <button onClick={createNewProject} className={`px-5 py-3 ${currentTheme.btn} rounded-xl text-[11px] font-black text-white flex items-center gap-2 hover:translate-y-[-2px] transition-all shadow-xl`}><Plus className="w-3.5 h-3.5" /> 启动全新剧作</button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3 pr-4 scrollbar-hide pb-8">
                {savedProjects.map(p => (
                  <div key={p.id} className={`group p-6 rounded-[2rem] border transition-all flex items-center justify-between ${projectId === p.id ? 'bg-sky-500/10 border-sky-500/40 shadow-inner' : `border-transparent ${theme === 'light' ? 'bg-slate-50 hover:bg-white hover:shadow-sm' : 'bg-black/20 hover:bg-black/40 hover:shadow-lg'}`}`}>
                    <div className="flex items-center gap-6 w-1/2">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all ${projectId === p.id ? 'bg-sky-500 text-white shadow-xl rotate-3' : 'bg-black/10 text-slate-500 group-hover:rotate-[-3deg]'}`}><FileJson className="w-7 h-7" /></div>
                      <div className="flex-1 w-full">
                        {editingVaultProjectId === p.id ? (
                          <input autoFocus className={`w-full bg-transparent border-b-2 border-sky-500 outline-none text-xl font-black italic tracking-tighter mb-0.5 pb-1 ${theme === 'light' ? 'text-slate-900' : 'text-white'}`} value={vaultProjectName} onChange={e => setVaultProjectName(e.target.value)} onBlur={() => submitRenameVaultProject(p.id)} onKeyDown={e => e.key === 'Enter' && submitRenameVaultProject(p.id)} />
                        ) : (
                          <h4 onClick={(e) => { e.stopPropagation(); setEditingVaultProjectId(p.id); setVaultProjectName(p.name); }} className="text-xl font-black italic tracking-tighter mb-0.5 truncate cursor-pointer hover:text-sky-500 transition-colors" title="点击重命名">{p.name}</h4>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                       <button onClick={(e) => { e.stopPropagation(); handleCloneVaultProject(p); }} className={`p-3 rounded-xl text-xs font-bold ${theme === 'light' ? 'bg-white hover:text-sky-600' : 'bg-white/10 hover:text-sky-400'} transition-all`} title="克隆副本"><Copy className="w-4 h-4" /></button>
                       <button onClick={(e) => { e.stopPropagation(); handleExportProjectJson(p); }} className={`p-3 rounded-xl text-xs font-bold ${theme === 'light' ? 'bg-white hover:text-indigo-600' : 'bg-white/10 hover:text-indigo-400'} transition-all`} title="导出项目JSON"><Download className="w-4 h-4" /></button>
                       {projectId !== p.id && <button onClick={() => loadProject(p)} className={`ml-2 px-6 py-3 ${theme === 'light' ? 'bg-slate-900 text-white' : 'bg-white text-slate-950'} rounded-xl text-xs font-black hover:scale-105 active:scale-95 transition-all shadow-lg`}>LOAD</button>}
                       <button onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }} className={`ml-2 p-3 rounded-xl ${theme === 'light' ? 'bg-red-50 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white'} transition-all`} title="彻底删除"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
           </div>
        </div>,
        document.body
      )}

      <AnimatePresence>
        {showSaveToast && createPortal(
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-16 right-10 z-[9999] px-6 py-4 bg-emerald-600 text-white rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400/20">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-xs font-black uppercase tracking-widest">Dexie DB Synced / Action Success</span>
          </motion.div>,
          document.body
        )}
      </AnimatePresence>
      
      {error && createPortal(
        <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`fixed bottom-12 left-1/2 -translate-x-1/2 px-10 py-5 bg-red-600 text-white rounded-[2rem] flex items-center gap-5 backdrop-blur-3xl z-[9999] shadow-2xl border border-white/10 font-bold text-sm tracking-widest`}>
          <AlertCircle className="w-5 h-5 fill-white text-red-600 shrink-0" />
          <span className="leading-relaxed">{error}</span>
          <button onClick={() => setError(null)} className="px-5 py-2 bg-black/40 rounded-xl hover:bg-black/60 transition-all font-mono tracking-normal ml-4 shrink-0">DISMISS</button>
        </motion.div>,
        document.body
      )}

    </div>
  );
}
