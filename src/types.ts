// src/types.ts
export interface Character { 
  id: string; 
  name: string; 
  age: string; 
  gender: string; 
  tone: string; 
  description: string; 
  voiceId?: string; 
  color?: string; // 角色专属高亮色
  avatarGradient?: string; // 生成的渐变头像
}

export interface AudioConfig {
  rate?: number;       // 语速倍率 (0.5 - 2.0)
  pitch?: number;      // 音高倍率 (0.5 - 2.0)
  pauseBefore?: number; // 句前停顿 (毫秒)
  pauseAfter?: number;  // 句后停顿 (毫秒)
}

export interface ScriptElement { 
  id: string; 
  type: "narration" | "dialogue" | "sound_effect"; 
  speaker?: string; 
  meta: string; 
  content: string; 
  sourceParaIds?: number[]; 
  audioConfig?: AudioConfig;                  // 局部调音配置
  pronunciations?: Record<string, string>;    // 多音字/发音替换词典 (如 {"重阳": "chóng yáng"})
}

export interface Chapter { 
  id: string; 
  title: string; 
  novelText: string; 
  scriptText: string; 
  parsedElements: ScriptElement[]; 
  directorNote?: string; 
  bgmUrl?: string; // 章节背景音效/BGM轨 (全局并行)
}

export interface Project { 
  id: string; 
  name: string; 
  lastModified: number; 
  chapters: Chapter[]; 
  characters: Character[]; 
  prodStyle: ProductionStyle; 
  readingSpeed: number; 
  theme: Theme; 
  globalPronunciations?: Record<string, string>; // 全局发音词典
}

export interface Snapshot { 
  id: string; 
  timestamp: number; 
  summary: string; 
  chapterData: Chapter; 
}

export type ProductionStyle = "都市言情" | "热血玄幻" | "悬疑惊悚" | "技术专业" | "温馨治愈";
export type Theme = "dark" | "light" | "forest";
export type FontSize = "sm" | "base" | "lg";
export type ViewMode = "standard" | "chat" | "table" | "timeline" | "teleprompter";