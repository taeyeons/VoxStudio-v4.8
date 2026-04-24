/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import { GoogleGenAI } from "@google/genai";
import { 
  Upload, FileText, Settings, Mic, Download, Copy, Trash2, 
  Loader2, Sparkles, Zap, Users, PlayCircle, CheckCircle2, 
  AlertCircle, Music4, BookOpen, Plus, LayoutGrid, ChevronRight, 
  Eye, EyeOff, Maximize2, Minimize2, Palette, Sun, Moon, Leaf,
  FolderOpen, Save, FileJson, Share2, Clock, Check, GripVertical, 
  Activity, Pencil
} from "lucide-react";
import { motion, AnimatePresence, Reorder } from "motion/react";

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

// --- 初始化 AI ---
const getAiClient = () => {
  const customKey = localStorage.getItem('vox_api_key') || undefined;
  const customUrl = localStorage.getItem('vox_base_url') || undefined;
  const config: any = { apiKey: customKey || process.env.GEMINI_API_KEY };
  if (customUrl) {
    config.httpOptions = { baseUrl: customUrl };
  }
  return new GoogleGenAI(config);
};

// --- 类型定义 ---
interface Character {
  id: string;
  name: string;
  age: string;
  gender: string;
  tone: string;
  description: string;
}

interface ScriptElement {
  id: string;
  type: "narration" | "dialogue" | "sound_effect";
  speaker?: string;
  meta: string;
  content: string;
  sourceParaIds?: number[];
}

interface Chapter {
  id: string;
  title: string;
  novelText: string;
  scriptText: string;
  parsedElements: ScriptElement[];
}

interface Project {
  id: string;
  name: string;
  lastModified: number;
  chapters: Chapter[];
  characters: Character[];
  prodStyle: ProductionStyle;
  readingSpeed: number;
  theme: Theme;
}

type ProductionStyle = "都市言情" | "热血玄幻" | "悬疑惊悚" | "技术专业" | "温馨治愈";
type Theme = "dark" | "light" | "forest";

export default function App() {
  // --- 持久化核心状态 ---
  const [projectId, setProjectId] = useState<string>(() => `proj-${Date.now()}`);
  const [projectName, setProjectName] = useState("未命名剧作项目");
  const [chapters, setChapters] = useState<Chapter[]>([
    { id: "ch-1", title: "点击输入/粘贴原文", novelText: "", scriptText: "", parsedElements: [] }
  ]);
  const [currentChapterId, setCurrentChapterId] = useState("ch-1");
  const [characters, setCharacters] = useState<Character[]>([
    { id: "nar", name: "旁白", age: "成熟", gender: "中性", tone: "磁性睿智", description: "环境烘托与情节转场" }
  ]);
  const [prodStyle, setProdStyle] = useState<ProductionStyle>("都市言情");
  const [readingSpeed, setReadingSpeed] = useState(250);
  const [theme, setTheme] = useState<Theme>("light");

  // --- 项目库管理状态 ---
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);

  // --- 设置与模型控制状态 ---
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gemini-3.1-pro-preview");
  const [hasCustomApiKey, setHasCustomApiKey] = useState(false);
  const [localApiKey, setLocalApiKey] = useState(() => localStorage.getItem('vox_api_key') || "");
  const [localBaseUrl, setLocalBaseUrl] = useState(() => localStorage.getItem('vox_base_url') || "");

  useEffect(() => {
    localStorage.setItem('vox_api_key', localApiKey);
  }, [localApiKey]);

  useEffect(() => {
    localStorage.setItem('vox_base_url', localBaseUrl);
  }, [localBaseUrl]);

  useEffect(() => {
    if (window.aistudio?.hasSelectedApiKey) {
      window.aistudio.hasSelectedApiKey().then(hasKey => {
         if (hasKey) setHasCustomApiKey(true);
      });
    }
  }, []);

  // --- UI 控制状态 ---
  const [activeTab, setActiveTab] = useState<"book" | "cast" | "studio">("book");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSource, setShowSource] = useState(true);
  const [syncScroll, setSyncScroll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editingSidebarChapterId, setEditingSidebarChapterId] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isResizing, setIsResizing] = useState(false);
  const hoveredCardRef = useRef<number | null>(null);

  const sourceScrollRef = useRef<HTMLDivElement>(null);
  const scriptScrollRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef<boolean>(false);

  // --- 侧边栏拖拽重置尺寸 ---
  const startResizing = () => setIsResizing(true);
  const stopResizing = () => setIsResizing(false);
  const onResize = (e: MouseEvent) => {
    if (isResizing) {
      const newWidth = Math.min(Math.max(200, e.clientX), 450);
      setSidebarWidth(newWidth);
    }
  };

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
  }, [isResizing]);

  // 更新高亮公用函数
  const applyHighlights = (cardIdx: number) => {
    const src = sourceScrollRef.current;
    const wb = scriptScrollRef.current;
    if (!src || !wb) return;
    
    const paras = Array.from(src.querySelectorAll('p')) as HTMLElement[];
    const cards = Array.from(wb.querySelectorAll('.script-card')) as HTMLElement[];
    
    cards.forEach((c, idx) => c.classList.toggle('active-card', idx === cardIdx));

    const activeElement = currentChapter.parsedElements[cardIdx];
    let activeParaIds: number[] = [];
    if (activeElement && activeElement.sourceParaIds && activeElement.sourceParaIds.length > 0) {
        activeParaIds = activeElement.sourceParaIds;
    } else {
        activeParaIds = [Math.round((cardIdx / Math.max(1, cards.length - 1)) * Math.max(0, paras.length - 1))];
    }
    
    paras.forEach((p, idx) => p.classList.toggle('active', activeParaIds.includes(idx)));
  };

  // --- 同步滚动逻辑 (基于智能提取的段落映射) ---
  const handleSourceScroll = () => {
    if (!syncScroll || !sourceScrollRef.current || !scriptScrollRef.current || isScrollingRef.current) return;
    isScrollingRef.current = true;
    
    const src = sourceScrollRef.current;
    const wb = scriptScrollRef.current;
    const paras = Array.from(src.querySelectorAll('p')) as HTMLElement[];
    const cards = Array.from(wb.querySelectorAll('.script-card')) as HTMLElement[];

    if (paras.length === 0 || cards.length === 0 || !currentChapter.parsedElements.length) {
      isScrollingRef.current = false;
      return;
    }

    // 1. 寻找距离左侧中心最近的原文段落
    const srcMid = src.scrollTop + (src.clientHeight / 2);
    let closestParaIdx = 0;
    let minDiff = Infinity;

    paras.forEach((p, idx) => {
        const pMid = p.offsetTop + (p.clientHeight / 2);
        const diff = Math.abs(pMid - srcMid);
        if (diff < minDiff) {
            minDiff = diff;
            closestParaIdx = idx;
        }
    });

    // 2. 利用 sourceParaIds 进行精准语义映射
    let targetCardIdx = -1;
    // 直接查找哪张卡片包含了这个段落 ID
    for (let i = 0; i < currentChapter.parsedElements.length; i++) {
        const el = currentChapter.parsedElements[i];
        if (el.sourceParaIds && el.sourceParaIds.includes(closestParaIdx)) {
            targetCardIdx = i;
            break; 
        }
    }
    
    // 如果没找到直接包含的，找最近的映射关系
    if (targetCardIdx === -1) {
        let nearestCard = 0;
        let minIdDiff = Infinity;
        for (let i = 0; i < currentChapter.parsedElements.length; i++) {
            const el = currentChapter.parsedElements[i];
            if (el.sourceParaIds && el.sourceParaIds.length > 0) {
                // 取平均或者第一个对应的段落
                const centerParaId = el.sourceParaIds[0];
                const d = Math.abs(centerParaId - closestParaIdx);
                if (d < minIdDiff) {
                   minIdDiff = d;
                   nearestCard = i;
                }
            }
        }
        targetCardIdx = nearestCard;
    }

    if (hoveredCardRef.current === null) {
      applyHighlights(targetCardIdx);
    }

    // 3. 将右侧对应的卡片滚动到视口中心位置
    const targetCard = cards[targetCardIdx] as HTMLElement;
    if (targetCard) {
        const targetWbScroll = targetCard.offsetTop + (targetCard.clientHeight / 2) - (wb.clientHeight / 2);
        wb.scrollTo({ top: targetWbScroll });
    }
    
    setTimeout(() => { isScrollingRef.current = false; }, 50);
  };

  const handleScriptScroll = () => {
    if (!syncScroll || !sourceScrollRef.current || !scriptScrollRef.current || isScrollingRef.current) return;
    isScrollingRef.current = true;

    const wb = scriptScrollRef.current;
    const src = sourceScrollRef.current;
    const paras = Array.from(src.querySelectorAll('p')) as HTMLElement[];
    const cards = Array.from(wb.querySelectorAll('.script-card')) as HTMLElement[];

    if (paras.length === 0 || cards.length === 0 || !currentChapter.parsedElements.length) {
      isScrollingRef.current = false;
      return;
    }

    // 1. 寻找距离右侧中心最近的剧本卡片
    const wbMid = wb.scrollTop + (wb.clientHeight / 2);
    let closestCardIdx = 0;
    let minDiff = Infinity;

    cards.forEach((c, idx) => {
        const cMid = c.offsetTop + (c.clientHeight / 2);
        const diff = Math.abs(cMid - wbMid);
        if (diff < minDiff) {
            minDiff = diff;
            closestCardIdx = idx;
        }
    });

    if (hoveredCardRef.current === null) {
      applyHighlights(closestCardIdx);
    }

    // 2. 使用该卡片的 sourceParaIds 精准定位左侧段落
    const activeElement = currentChapter.parsedElements[closestCardIdx];
    let targetParaIdx = 0;
    
    if (activeElement && activeElement.sourceParaIds && activeElement.sourceParaIds.length > 0) {
        // 取映射中的第一个段落
        targetParaIdx = activeElement.sourceParaIds[0];
    } else {
        // Fallback: 比例估算
        const ratio = cards.length > 1 ? closestCardIdx / (cards.length - 1) : 0;
        targetParaIdx = Math.round(ratio * (paras.length - 1));
    }

    // 防止越界
    targetParaIdx = Math.max(0, Math.min(targetParaIdx, paras.length - 1));

    // 3. 将左侧对应的原文段落滚动到视口中心位置
    const targetPara = paras[targetParaIdx] as HTMLElement;
    if (targetPara) {
        const targetSrcScroll = targetPara.offsetTop + (targetPara.clientHeight / 2) - (src.clientHeight / 2);
        src.scrollTo({ top: targetSrcScroll });
    }

    setTimeout(() => { isScrollingRef.current = false; }, 50);
  };

  // --- 初始化加载 ---
  useEffect(() => {
    const stored = localStorage.getItem("vox_studio_projects");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Project[];
        setSavedProjects(parsed);
      } catch (e) {
        console.error("加载项目库失败", e);
      }
    }
  }, []);

  // --- 自动保存至 localStorage ---
  useEffect(() => {
    localStorage.setItem("vox_studio_projects", JSON.stringify(savedProjects));
  }, [savedProjects]);

  const currentChapter = chapters.find(c => c.id === currentChapterId) || chapters[0];

  // --- 实时节奏分析 ---
  const pacingData = useMemo(() => {
    if (!currentChapter.parsedElements.length) return [];
    return currentChapter.parsedElements.map((el, i) => ({
      x: i,
      y: el.type === 'sound_effect' ? 80 : el.type === 'dialogue' ? 50 : 20,
      type: el.type
    }));
  }, [currentChapter.parsedElements]);

  // --- 脚本修改逻辑 ---
  const updateScriptElement = (elId: string, updates: Partial<ScriptElement>) => {
    setChapters(prev => prev.map(ch => {
      if (ch.id === currentChapterId) {
        return {
          ...ch,
          parsedElements: ch.parsedElements.map(el => 
            el.id === elId ? { ...el, ...updates } : el
          )
        };
      }
      return ch;
    }));
  };

  const reorderScriptElements = (newElements: ScriptElement[]) => {
    setChapters(prev => prev.map(ch => 
      ch.id === currentChapterId ? { ...ch, parsedElements: newElements } : ch
    ));
  };

  // --- 主题配置 ---
  const themeConfig = {
    dark: { 
        bg: "bg-[#020617]", text: "text-slate-100", nav: "bg-[#0F172A]/90", 
        border: "border-slate-800", card: "bg-slate-900/40", accent: "text-sky-400", 
        btn: "bg-sky-600", sidebar: "bg-black/20", subtile: "text-slate-500"
    },
    light: { 
        bg: "bg-[#f8fafc]", text: "text-slate-900", nav: "bg-white/90", 
        border: "border-slate-200", card: "bg-white shadow-sm", accent: "text-sky-600", 
        btn: "bg-sky-500", sidebar: "bg-slate-50", subtile: "text-slate-400"
    },
    forest: { 
        bg: "bg-[#022c22]", text: "text-emerald-50", nav: "bg-[#064e3b]/90", 
        border: "border-emerald-800", card: "bg-emerald-900/40", accent: "text-emerald-400", 
        btn: "bg-emerald-600", sidebar: "bg-emerald-950/20", subtile: "text-emerald-700"
    }
  };

  const currentTheme = themeConfig[theme];

  // --- 项目管理逻辑 ---
  const saveCurrentProject = () => {
    const currentProject: Project = {
      id: projectId,
      name: projectName,
      lastModified: Date.now(),
      chapters,
      characters,
      prodStyle,
      readingSpeed,
      theme
    };

    setSavedProjects(prev => {
      const exists = prev.find(p => p.id === projectId);
      if (exists) {
        return prev.map(p => p.id === projectId ? currentProject : p);
      }
      return [currentProject, ...prev];
    });

    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 2000);
  };

  const loadProject = (project: Project) => {
    setProjectId(project.id);
    setProjectName(project.name);
    setChapters(project.chapters);
    setCurrentChapterId(project.chapters[0]?.id || "ch-1");
    setCharacters(project.characters);
    setProdStyle(project.prodStyle);
    setReadingSpeed(project.readingSpeed);
    setTheme(project.theme);
    setShowProjectModal(false);
  };

  const deleteProject = (id: string) => {
    setSavedProjects(prev => prev.filter(p => p.id !== id));
  };

  const createNewProject = () => {
    setProjectId(`proj-${Date.now()}`);
    setProjectName("未命名剧作项目");
    setChapters([{ id: "ch-1", title: "点击输入/粘贴原文", novelText: "", scriptText: "", parsedElements: [] }]);
    setCurrentChapterId("ch-1");
    setCharacters([{ id: "nar", name: "旁白", age: "成熟", gender: "中性", tone: "磁性睿智", description: "环境烘托与情节转场" }]);
    setActiveTab("book");
    setShowProjectModal(false);
  };

  const saveAsProject = () => {
    const newId = `proj-${Date.now()}`;
    const newName = `${projectName} (副本)`;
    const newProject: Project = {
      id: newId,
      name: newName,
      lastModified: Date.now(),
      chapters,
      characters,
      prodStyle,
      readingSpeed,
      theme
    };
    setSavedProjects(prev => [newProject, ...prev]);
    setProjectId(newId);
    setProjectName(newName);
    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 2000);
  };

  const exportProjectToJSON = (project: Project) => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VoxProject_${project.name}_${new Date().toLocaleDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

  // --- 逻辑函数 ---
  const updateChapterData = (updates: Partial<Chapter>) => {
    setChapters(prev => prev.map(c => c.id === currentChapterId ? { ...c, ...updates } : c));
  };

  const handleSplitImport = (fullText: string) => {
    const splitRegex = /\n?\s*(第[一二三四五六七八九十百千万0-9]+[章节回卷节][^\n]{0,20}|楔子|序[章幕]|前言|后记)/g;
    const matches = Array.from(fullText.matchAll(splitRegex));
    if (matches.length <= 1) { updateChapterData({ novelText: fullText }); return; }
    const newChapters: Chapter[] = [];
    for (let i = 0; i < matches.length; i++) {
        const title = matches[i][0].trim();
        const startIdx = matches[i].index! + matches[i][0].length;
        const endIdx = (i + 1 < matches.length) ? matches[i+1].index : fullText.length;
        const content = fullText.slice(startIdx, endIdx).trim();
        newChapters.push({ id: `ch-${Date.now()}-${i}`, title, novelText: content, scriptText: "", parsedElements: [] });
    }
    setChapters(newChapters);
    setCurrentChapterId(newChapters[0].id);
  };

  const parseScript = (text: string) => {
    const lines = text.split("\n").filter(l => l.trim() !== "");
    const elements: ScriptElement[] = [];
    lines.forEach((line, i) => {
      // 容错处理：匹配形如 【旁白】[1,2]：（描述）内容 的格式
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
        elements.push({ id: `el-${Date.now()}-${i}`, type, meta, content, speaker: type === "dialogue" ? speaker : undefined, sourceParaIds });
      }
    });
    return elements;
  };

  const runGeneration = async () => {
    if (!currentChapter.novelText.trim()) { setError("原文内容不能为空"); return; }
    setIsProcessing(true);
    setError(null);
    try {
      const charPrompt = characters.map(c => `- ${c.name}：${c.gender}/${c.age}，${c.tone}。${c.description}`).join("\n");
      const systemInstruction = `你是有声书改编专家。风格：${prodStyle}。
全局人设配置：
${charPrompt}

【核心任务】
将给定的带有段落编号小说原文，转化为适合多人/双播/单播的有声书剧本。

【极为重要的红线规则】
必须 100% 保留原文所有的情节、景物描写、心理描写、动作描写以及对话！每一行原文内容都必须无损转化为剧本内容，一字不差或在保证信息量绝不减少的前提下润色。
绝对禁止删减原文内容！绝对禁止将大量描写总结概括成一两句话！如果你对原文进行了删减、提炼或剧情跳过，将会直接导致工作失败。

【输出格式控制】
必须且只使用以下三种前缀格式（不要任何多余的 Markdown 标记如粗体或代码块），且每个条目必须附带其对应的[原段落编号]（可以多个编号用逗号隔开），格式如下：

【旁白】[0,1]：（情感氛围/语气/节奏指令）负责环境描写、动作描写、时间流逝等原文中非开口说话的外在维度的客观描述。
【具体的角色名字】[2]：（语气/神态/心理状态）负责角色的台词/对白，以及该角色的【内心独白】！绝对不要真的输出“角色名”三个字，必须填写真实的名字！心理活动一律视为该角色自己的对白演绎！绝对禁止在角色的小括号中输出肢体动作（如“揉眼睛”、“走向前”），肢体动作一律单拆为旁白！
【场景音】[3]：（详细的物理环境音效，用以辅助听觉氛围营造）

【执行规范】
1. 动作与台词极度分离：凡是物理肢体动作（如揉眼睛、转头、深吸一口气），绝对不能放在角色的发声台词/内心独白里，也不能放在角色的语气括号中！所有的动作必须独立切分出来，交由【旁白】演播。例如原文“他揉揉眼睛，心想：这怎么可能？”，必须严格拆分为——先写一行【旁白】[X]负责动作，再换行写【角色】[X]负责独白。
2. 角色台词剥离：逢“某某说：‘你好’”等句式，将“你好”划分为角色对白，将“某某说”通过角色的语气括号备注体现（动作交由旁白）。
3. 内心活动归属：凡是“XX心想”、“XX暗道”这类内心独白，全部抽离出作为该【具体的角色名字】的对播台词，括号标注（内心独白/心里想）。
4. 切分节奏：遇到长篇大论的旁白原文，必须将其拆分为多条短【旁白】和【场景音】。
5. 字句保留：剧本的文本量必须基本等于甚至略大于源小说的文本量，不可以偷工减料。`;
      
      const numberedText = currentChapter.novelText.split("\n").filter(p => p.trim()).map((p, i) => `[${i}] ${p}`).join("\n");

      const response = await getAiClient().models.generateContent({
        model: selectedModel,
        contents: [{ role: "user", parts: [{ text: numberedText }] }],
        config: { systemInstruction, temperature: 0.7 }
      });
      const scriptText = response.text;
      if (!scriptText) throw new Error("AI 返回内容为空");
      updateChapterData({ scriptText, parsedElements: parseScript(scriptText) });
    } catch (e: any) { setError(`制作失败：${e.message}`); } finally { setIsProcessing(false); }
  };

  const extractCharacters = async () => {
    if (!currentChapter.novelText.trim()) return;
    setIsProcessing(true);
    try {
      const sample = chapters.slice(0, 10).map(c => c.novelText).join("\n\n").slice(0, 12000);
      const prompt = `你是一个资深文学编辑。请提取小说全部角色。输出严格 JSON 数组格式，不要任何 Markdown 标记或多余文字。字段：[{"name":"姓名","gender":"性别","age":"年龄段","tone":"建议音色","description":"性格特征"}]\n文本：\n${sample}`;
      const response = await getAiClient().models.generateContent({
        model: selectedModel,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { 
          responseMimeType: "application/json",
          temperature: 0.1 
        }
      });
      
      let rawText = response.text || "[]";
      
      // 更鲁棒的 JSON 提取逻辑：寻找第一个 [ 和最后一个 ] 之间的内容
      const firstBracket = rawText.indexOf('[');
      const lastBracket = rawText.lastIndexOf(']');
      
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        rawText = rawText.substring(firstBracket, lastBracket + 1);
      }
      
      const extracted = JSON.parse(rawText.trim());
      const existing = new Set(characters.map(c => c.name));
      const fresh = extracted.filter((c: any) => !existing.has(c.name)).map((c: any, i: number) => ({ ...c, id: `char-${Date.now()}-${i}` }));
      setCharacters(prev => [...prev, ...fresh]);
      setActiveTab("cast");
    } catch (e: any) { setError(`建模失败：${e.message}`); } finally { setIsProcessing(false); }
  };

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'txt' | 'markdown' | 'word'>('txt');
  const [exportScope, setExportScope] = useState<'single' | 'all'>('single');

  const generateChapterExport = (chap: Chapter, format: 'txt' | 'markdown' | 'word'): string => {
    if (!chap.parsedElements || chap.parsedElements.length === 0) {
      // Fallback for unparsed but generated raw script, although removing markers requires regex here
      return chap.scriptText.replace(/\[[0-9,\s]+\]/g, "");
    }

    if (format === 'txt') {
      return chap.parsedElements.map(el => {
        const prefix = el.type === 'dialogue' ? `【${el.speaker}】` : el.type === 'narration' ? `【旁白】` : `【场景音】`;
        return `${prefix}：（${el.meta}）${el.content}`;
      }).join('\n\n');
    }
    
    if (format === 'markdown') {
      return chap.parsedElements.map(el => {
        const prefix = el.type === 'dialogue' ? `**【${el.speaker}】**` : el.type === 'narration' ? `*【旁白】*` : `_【场景音】_`;
        return `${prefix}：^（${el.meta}）^ ${el.content}`;
      }).join('\n\n');
    }
    
    if (format === 'word') {
      const rows = chap.parsedElements.map(el => {
        const color = el.type === 'dialogue' ? '#e11d48' : el.type === 'narration' ? '#0ea5e9' : '#d97706';
        const name = el.type === 'dialogue' ? el.speaker : el.type === 'narration' ? '旁白' : '场景音效';
        return `
          <div style="margin-bottom: 12px; font-family: 'Microsoft YaHei', sans-serif; line-height: 1.6;">
             <strong style="color: ${color};">【${name}】</strong>
             <span style="color: #666666; font-style: italic;">（${el.meta}）</span>
             <span style="font-size: 16px; color: #333333;">${el.content}</span>
          </div>`;
      }).join('');
      return rows;
    }
    
    return "";
  };

  const executeExport = () => {
    let finalContent = "";
    let mimeType = "text/plain";
    let extension = "txt";
    let fileName = "";

    if (exportFormat === 'word') {
      mimeType = "application/msword";
      extension = "doc";
    } else if (exportFormat === 'markdown') {
      extension = "md";
    }

    if (exportScope === 'single') {
      if (!currentChapter.scriptText) {
        setError("当前章节没有可导出的剧本");
        return;
      }
      fileName = `${projectName}_${currentChapter.title}.${extension}`;
      if (exportFormat === 'word') {
        finalContent = `
          <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
          <head><meta charset='utf-8'><title>${currentChapter.title}</title></head>
          <body>
            <h1 style="text-align: center; font-family: 'Microsoft YaHei', sans-serif;">${currentChapter.title}</h1>
            ${generateChapterExport(currentChapter, exportFormat)}
          </body>
          </html>
        `;
      } else {
        finalContent = generateChapterExport(currentChapter, exportFormat);
      }
    } else {
      const generatedChapters = chapters.filter(c => c.scriptText.trim() !== "");
      if (generatedChapters.length === 0) {
        setError("没有可导出的已生成剧本");
        return;
      }
      fileName = `${projectName}_全本合并.${extension}`;
      
      if (exportFormat === 'word') {
        const body = generatedChapters.map(c => `
          <h1 style="text-align: center; font-family: 'Microsoft YaHei', sans-serif; page-break-before: always;">${c.title}</h1>
          ${generateChapterExport(c, exportFormat)}
        `).join('');
        finalContent = `
          <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
          <head><meta charset='utf-8'><title>${projectName}</title></head>
          <body>${body}</body>
          </html>
        `;
      } else {
        const divider = exportFormat === 'markdown' ? '\n\n---\n\n' : '\n\n================================\n\n';
        finalContent = generatedChapters.map(c => {
          const titleLine = exportFormat === 'markdown' ? `## ${c.title}` : `[ ${c.title} ]`;
          return `${titleLine}\n\n${generateChapterExport(c, exportFormat)}`;
        }).join(divider);
      }
    }

    const blob = new Blob([finalContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportModal(false);
  };

  const totalNovelWords = useMemo(() => chapters.reduce((sum, ch) => sum + ch.novelText.length, 0), [chapters]);
  const totalScriptDuration = useMemo(() => chapters.reduce((sum, ch) => sum + (ch.parsedElements.length * 15), 0) / 60, [chapters]);

  return (
    <div className={`h-screen flex flex-col ${currentTheme.bg} ${currentTheme.text} font-sans overflow-hidden transition-colors duration-500`}>
      {/* 顶部导航 */}
      <nav className={`h-16 flex items-center justify-between px-6 ${currentTheme.nav} border-b ${currentTheme.border} backdrop-blur-xl z-[100] shrink-0`}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${currentTheme.btn} rounded-xl flex items-center justify-center shadow-lg text-white`}><Mic className="w-5 h-5" /></div>
            <div>
              <h1 className="text-xs font-black tracking-widest uppercase opacity-90">VoxStudio v4.8</h1>
              <p className="text-[8px] opacity-40 font-mono tracking-tighter italic">PROFESSIONAL WORKFLOW</p>
            </div>
          </div>
          <div className={`h-8 w-px ${currentTheme.border}`} />
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[9px] font-black opacity-30 uppercase mb-0.5 tracking-tighter">Project / 剧本总称</span>
              <input className="bg-transparent border-none outline-none text-sm font-black focus:text-sky-400 transition-colors w-44" value={projectName} onChange={e => setProjectName(e.target.value)} />
            </div>
            <div className="flex gap-1">
              <button onClick={() => setShowProjectModal(true)} className={`p-2 rounded-lg ${theme === 'light' ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-slate-400'} transition-all`} title="项目管理"><FolderOpen className="w-4 h-4" /></button>
              <button onClick={saveCurrentProject} className={`p-2 rounded-lg ${theme === 'light' ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-slate-400'} transition-all`} title="保存当前"><Save className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        <div className={`flex ${theme === 'light' ? 'bg-slate-200' : 'bg-slate-900/80'} p-1 rounded-2xl border ${currentTheme.border}`}>
          {[
            { id: "book", label: "资源管控", icon: BookOpen },
            { id: "cast", label: "角色资产", icon: Users },
            { id: "studio", label: "剧本工坊", icon: Zap }
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex items-center gap-2 px-6 py-2.5 text-sm font-black rounded-xl transition-all ${activeTab === t.id ? (theme === 'light' ? 'bg-white text-sky-600 shadow-lg' : 'bg-sky-600 text-white shadow-xl') : 'text-slate-500 hover:text-sky-400'}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <div className={`flex items-center bg-black/10 rounded-xl p-1 border ${currentTheme.border}`}>
            {(['dark', 'light', 'forest'] as Theme[]).map(t => (
              <button key={t} onClick={() => setTheme(t)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${theme === t ? 'bg-white/10 shadow-lg scale-110' : 'opacity-40 hover:opacity-100'}`}>
                {t === 'dark' ? <Moon className="w-4 h-4" /> : t === 'light' ? <Sun className="w-4 h-4" /> : <Leaf className="w-4 h-4 text-emerald-500" />}
              </button>
            ))}
          </div>
          <button onClick={() => setShowSettingsModal(true)} className={`p-2 rounded-xl transition-all border ${currentTheme.border} ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`} title="全局配置 (Settings)">
            <Settings className="w-5 h-5" />
          </button>
          <div className="flex gap-2">
            <button onClick={() => setShowExportModal(true)} className="px-5 py-2.5 bg-white text-slate-950 rounded-xl text-xs font-black shadow-lg flex items-center gap-2 hover:bg-sky-50 transition-all active:scale-95 text-nowrap"><Download className="w-4 h-4 text-sky-500" /> 导出剧作 / Export</button>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        <aside 
          style={{ width: sidebarWidth }}
          className={`border-r ${currentTheme.border} ${currentTheme.sidebar} flex flex-col shrink-0 transition-all duration-75 relative`}
        >
          <div className={`p-5 flex justify-between items-center ${theme === 'light' ? 'bg-slate-200/50' : 'bg-slate-950/20'} border-b ${currentTheme.border}`}>
            <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">Directory / 章节</span>
            <button onClick={() => { const id = `ch-${Date.now()}`; setChapters([...chapters, { id, title: "新章节文本", novelText: "", scriptText: "", parsedElements: [] }]); setCurrentChapterId(id); }} className="p-1.5 text-sky-500 hover:bg-sky-500/10 rounded-lg transition-all"><Plus className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-hide">
            {chapters.map((ch, idx) => (
              <div key={ch.id} onClick={() => setCurrentChapterId(ch.id)} className={`group relative p-4 rounded-2xl cursor-pointer border transition-all ${currentChapterId === ch.id ? (theme === 'light' ? 'bg-sky-500 text-white border-sky-600/20 shadow-lg' : 'bg-sky-600/10 border-sky-500/40 text-sky-400') : `border-transparent opacity-60 hover:opacity-100 ${theme === 'light' ? 'hover:bg-slate-200' : 'hover:bg-slate-900/50'}`}`}>
                <div className="flex flex-col gap-1 pr-14">
                  <div className={`text-[8px] font-mono opacity-40 ${currentChapterId === ch.id && theme === 'light' ? 'text-white' : ''}`}>CH-{(idx+1).toString().padStart(2,'0')}</div>
                  {editingSidebarChapterId === ch.id ? (
                    <input 
                      autoFocus
                      className={`bg-black/20 text-white border-none outline-none text-xs font-black p-1.5 rounded-lg w-full ring-1 ring-white/20`}
                      value={ch.title}
                      onChange={(e) => updateChapterData({ title: e.target.value })}
                      onBlur={() => setEditingSidebarChapterId(null)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditingSidebarChapterId(null)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="text-xs font-black leading-tight break-words">{ch.title}</div>
                  )}
                </div>
                {ch.scriptText && <div className={`absolute top-4 right-4 w-1.5 h-1.5 ${currentChapterId === ch.id && theme === 'light' ? 'bg-white' : 'bg-sky-500'} rounded-full`} />}
                <div className={`absolute bottom-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-10`}>
                  <button onClick={(e) => { e.stopPropagation(); setEditingSidebarChapterId(ch.id); }} className={`p-1.5 hover:bg-black/10 rounded-lg transition-all ${currentChapterId === ch.id && theme === 'light' ? 'text-white' : 'text-sky-500'}`} title="编辑"><Settings className="w-3.5 h-3.5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); if(chapters.length > 1) setChapters(chapters.filter(c => c.id !== ch.id)) }} className={`p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg ${currentChapterId === ch.id && theme === 'light' ? 'text-white' : ''}`} title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
          <div className={`mt-auto p-6 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-950/40'} border-t ${currentTheme.border} space-y-4`}>
             <div className="flex justify-between items-center"><span className="text-[9px] font-black opacity-40 uppercase">Global Words</span><span className={`text-xs font-mono font-black ${currentTheme.accent}`}>{totalNovelWords.toLocaleString()}</span></div>
             <div className="flex justify-between items-center"><span className="text-[9px] font-black opacity-40 uppercase">Est. Runtime</span><span className={`text-xs font-mono font-black ${currentTheme.accent}`}>{totalScriptDuration.toFixed(1)} MIN</span></div>
          </div>
          {/* Resize Handle */}
          <div 
            onMouseDown={startResizing}
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-sky-500 transition-all active:bg-sky-600 z-50 group"
          >
            <div className="h-full w-full opacity-0 group-hover:opacity-100 bg-sky-500/20" />
          </div>
        </aside>

        <div className="flex-1 flex overflow-hidden relative">
          <AnimatePresence mode="wait">
            {activeTab === "book" && (
              <motion.div key="book" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col p-5 gap-5 overflow-hidden w-full">
                <div className="flex justify-between items-end shrink-0 px-6">
                  <div className="max-w-xl">
                    <h2 className="text-xl font-black italic tracking-tighter">Asset Management / 资源管控</h2>
                    <p className="text-[9px] opacity-40 mt-0.5 uppercase tracking-[0.2em] font-black leading-none">Global workspace for content processing</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => {
                        const input = document.createElement("input"); input.type = "file"; input.accept = ".txt";
                        input.onchange = (e: any) => { const r = new FileReader(); r.onload = (ev) => handleSplitImport(ev.target?.result as string); r.readAsText(e.target.files[0]); };
                        input.click();
                    }} className={`px-4 py-2 ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/10'} border rounded-xl text-[9px] font-black flex items-center gap-2 hover:border-sky-500 transition-all`}><Upload className="w-3 h-3" /> 批量导入</button>
                    <button onClick={extractCharacters} disabled={isProcessing || !currentChapter.novelText} className={`px-4 py-2 ${currentTheme.btn} rounded-xl text-[9px] font-black text-white flex items-center gap-2 shadow-lg hover:brightness-110 active:scale-95 transition-all`}>
                       {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Sparkles className="w-3 h-3" /> 人物建模全栈扫描</>}
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex gap-5 overflow-hidden">
                   <div className={`flex-1 ${theme === 'light' ? 'bg-white border-slate-100 shadow-sm' : 'bg-slate-900/10 border-white/5'} border rounded-[2rem] p-8 flex flex-col relative overflow-hidden`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-1 h-6 bg-sky-500 rounded-full" />
                        <input className="bg-transparent border-none outline-none text-lg font-black p-0 w-full placeholder:opacity-10 italic tracking-tighter" placeholder="本章标题" value={currentChapter.title} onChange={e => updateChapterData({ title: e.target.value })} />
                      </div>
                      <textarea className={`flex-1 w-full bg-transparent resize-none border-none outline-none text-[15px] font-medium leading-relaxed scrollbar-hide whitespace-pre-wrap ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`} placeholder="在此录入或粘贴小说原文内容..." value={currentChapter.novelText} onChange={e => {
                          const text = e.target.value;
                          if (currentChapter.novelText === "" && text.includes("第") && text.length > 2000) handleSplitImport(text);
                          else updateChapterData({ novelText: text });
                      }} />
                      <div className={`mt-3 pt-3 border-t ${currentTheme.border} flex justify-between items-center opacity-20`}>
                        <div className="flex items-center gap-6"><span className="text-[8px] font-mono font-black italic">NODE:READY</span><span className="text-[8px] font-mono font-black italic">UTF-8</span></div>
                        <div className="flex items-center gap-6"><span className="text-[8px] font-mono font-black italic">CHARS: {currentChapter.novelText.length}</span></div>
                      </div>
                   </div>

                   <div className="w-72 flex flex-col gap-6 shrink-0 h-full">
                      <div className={`flex-1 ${theme === 'light' ? 'bg-slate-50 border-slate-100' : 'bg-black/20 border-white/5'} border rounded-[2.5rem] p-8 flex flex-col shadow-inner overflow-hidden shrink-0`}>
                         <h3 className="text-[9px] font-black opacity-30 uppercase tracking-[0.4em] mb-8 italic">Intelligence / 章节情报</h3>
                         <div className="space-y-6 flex-1 overflow-y-auto scrollbar-hide">
                            <div className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm transition-all hover:scale-[1.02]">
                               <span className="text-[8px] font-black opacity-30 uppercase block mb-2 italic tracking-widest leading-none">Density Analysis</span>
                               <div className="text-2xl font-black italic tracking-tighter">{(currentChapter.novelText.length / 50).toFixed(1)} <span className="text-[10px] opacity-30 uppercase tracking-widest">Pages</span></div>
                            </div>
                            <div className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm transition-all hover:scale-[1.02]">
                               <span className="text-[8px] font-black opacity-30 uppercase block mb-2 italic tracking-widest leading-none">Semantic Marker</span>
                               <div className="text-2xl font-black italic tracking-tighter text-sky-500">{currentChapter.novelText.length > 5000 ? "Epic Scale" : "Fast Pace"}</div>
                            </div>
                         </div>
                         <div className={`mt-8 p-6 rounded-[2rem] ${theme === 'light' ? 'bg-sky-600 text-white shadow-lg' : 'bg-sky-500/10 text-sky-400'} shadow-2xl shrink-0`}>
                            <p className="text-[9px] font-black uppercase mb-2 tracking-widest leading-none">Workflow Insight</p>
                            <p className="text-[11px] font-bold leading-relaxed opacity-90 italic">系统侦测到文本具备索引结构。点击扫描以建立角色依赖树。</p>
                         </div>
                      </div>
                   </div>
                </div>
              </motion.div>
            )}

            {activeTab === "cast" && (
              <motion.div key="cast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col p-8 lg:p-10 gap-8 overflow-hidden relative">
                 <div className="flex justify-between items-center px-4 shrink-0">
                    <h2 className="text-2xl font-black italic tracking-tighter">Cast Personnel / 角色人员库</h2>
                    <div className="flex items-center gap-6">
                       <div className="flex flex-col"><span className="text-[9px] font-black opacity-30 uppercase mb-2 leading-none">Art Style</span><select className={`${theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-white/10 text-slate-300'} border rounded-xl px-4 py-1.5 text-[10px] font-black outline-none`} value={prodStyle} onChange={e => setProdStyle(e.target.value as any)}>{["都市言情", "热血玄幻", "悬疑惊悚", "技术专业", "温馨治愈"].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                       <div className="flex flex-col"><span className="text-[9px] font-black opacity-30 uppercase mb-2 leading-none">Reading Pace</span><div className={`h-8 ${theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-white/5'} border rounded-xl flex items-center px-4 gap-3 shadow-inner`}><input type="range" min="150" max="400" step="10" className="w-32 accent-sky-500" value={readingSpeed} onChange={e => setReadingSpeed(Number(e.target.value))} /><span className={`text-[10px] font-mono font-black ${currentTheme.accent} w-8`}>{readingSpeed}</span></div></div>
                    </div>
                 </div>
                 <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-y-auto px-4 scrollbar-hide pb-32">
                    {characters.map(char => (
                      <div key={char.id} className={`${theme === 'light' ? 'bg-white shadow-xl shadow-slate-200/50 border-slate-100' : 'bg-slate-950 border-white/5 shadow-2xl shadow-black/20'} p-7 border rounded-[2rem] relative group hover:border-sky-500 transition-all flex flex-col min-h-[260px]`}>
                         <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => setEditingCharId(char.id)} className={`p-2 rounded-lg bg-sky-500/10 text-sky-500 hover:bg-sky-500 hover:text-white transition-all`} title="精修"><Settings className="w-3.5 h-3.5" /></button>
                            {char.id !== 'nar' && <button onClick={() => setCharacters(characters.filter(c => c.id !== char.id))} className={`p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all`} title="删除"><Trash2 className="w-3.5 h-3.5" /></button>}
                         </div>
                         <div className="flex justify-between items-start mb-5 pr-12">
                            <div>
                               <h3 className="text-lg font-black">{char.name}</h3>
                               <div className="text-[10px] opacity-40 font-bold mt-1">{char.gender} / {char.age}</div>
                            </div>
                         </div>
                         <p className="text-xs opacity-60 line-clamp-3 leading-relaxed mb-6 flex-1 italic">{char.description}</p>
                         <div className={`mt-auto pt-5 border-t ${currentTheme.border}`}>
                            <div className="text-[10px] font-black opacity-30 uppercase tracking-widest mb-1.5">Voice Texture</div>
                            <div className={`text-[11px] font-bold ${currentTheme.accent} leading-tight`}>{char.tone}</div>
                         </div>
                      </div>
                    ))}
                    <button onClick={() => setCharacters([...characters, { id: `c-${Date.now()}`, name: "新演员", gender: "男", age: "青年", tone: "中性", description: "输入详细设定..." }])} className={`${theme === 'light' ? 'border-slate-200 shadow-sm' : 'border-slate-800 bg-black/5'} border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center transition-all group hover:border-sky-500 min-h-[260px]`}><Plus className="w-10 h-10 mb-3 group-hover:scale-110 group-hover:text-sky-500 transition-all opacity-20" /><span className="text-[9px] font-black uppercase tracking-[0.4em] opacity-30">Deploy Actor</span></button>
                 </div>
                 <div className="absolute bottom-10 left-12 right-12 flex justify-center pointer-events-none">
                    <button onClick={() => setActiveTab("studio")} className={`h-16 w-full max-w-xl ${currentTheme.btn} text-white rounded-[2rem] font-black text-xs shadow-[0_20px_50px_rgba(2,132,199,0.3)] flex items-center justify-center gap-4 hover:translate-y-[-6px] transition-all transform-gpu border border-white/20 active:scale-95 pointer-events-auto shadow-2xl`}>部署至演播室并开启自动化生产 <ChevronRight className="w-5 h-5" /></button>
                 </div>
              </motion.div>
            )}

            {activeTab === "studio" && (
              <motion.div key="studio" initial={{ opacity: 0, scale: 1.01 }} animate={{ opacity: 1, scale: 1 }} className={`flex-1 flex flex-col p-6 gap-6 overflow-hidden ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-950'}`}>
                 <div className="flex items-center justify-between px-8 py-4 shrink-0">
                    <div className="flex items-center gap-6">
                       <div className="flex flex-col"><span className={`text-[9px] font-black ${currentTheme.accent} uppercase tracking-widest mb-1 leading-none`}>Production Studio</span><span className="text-lg font-black truncate max-w-[320px] italic">{currentChapter.title}</span></div>
                    </div>
                    <button disabled={isProcessing || !currentChapter.novelText} onClick={runGeneration} className={`h-11 px-10 ${currentTheme.btn} rounded-2xl text-[11px] font-black shadow-2xl hover:brightness-110 transition-all flex items-center gap-4 active:scale-95 text-white transform-gpu`}>{isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-5 h-5 fill-white" /> 向 AI 发起演播生成指令</>}</button>
                 </div>

                 <div className="flex-1 flex gap-6 overflow-hidden">
                    <AnimatePresence>
                      {showSource && (
                        <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: "38%", opacity: 1 }} exit={{ width: 0, opacity: 0 }} className={`flex flex-col border ${currentTheme.border} rounded-[3rem] ${theme === 'light' ? 'bg-white shadow-2xl shadow-slate-200/50' : 'bg-slate-950/50 shadow-2xl shadow-black/40'} overflow-hidden shrink-0 relative`}>
                           <div className={`px-6 py-2 border-b ${currentTheme.border} flex justify-between items-center ${theme === 'light' ? 'bg-slate-50' : 'bg-black/40'}`}>
                              <span className="text-[10px] font-black opacity-30 uppercase tracking-[0.2em] italic">Original Asset</span>
                              <button onClick={() => setShowSource(false)} className={`p-1 rounded-xl transition-all ${theme === 'light' ? 'hover:bg-slate-100 text-slate-400' : 'hover:bg-white/10 text-slate-600'}`}><EyeOff className="w-4 h-4" /></button>
                           </div>
                           <div 
                             ref={sourceScrollRef}
                             onScroll={handleSourceScroll}
                             className="flex-1 p-10 pt-6 overflow-y-auto scrollbar-hide space-y-6"
                           >
                             {currentChapter.novelText.split("\n").filter(p => p.trim()).map((para, pIdx) => (
                               <p 
                                 key={pIdx} 
                                 onMouseEnter={() => {
                                   if (!syncScroll) return;
                                   const src = sourceScrollRef.current;
                                   const wb = scriptScrollRef.current;
                                   if (!src || !wb) return;
                                   const paras = Array.from(src.querySelectorAll('p')) as HTMLElement[];
                                   const cards = Array.from(wb.querySelectorAll('.script-card')) as HTMLElement[];
                                   paras.forEach((p, idx) => p.classList.toggle('active', idx === pIdx));
                                   let targetCardIdx = -1;
                                   for (let i = 0; i < currentChapter.parsedElements.length; i++) {
                                       const el = currentChapter.parsedElements[i];
                                       if (el.sourceParaIds && el.sourceParaIds.includes(pIdx)) { targetCardIdx = i; break; }
                                   }
                                   if (targetCardIdx === -1) {
                                       let nearestCard = 0; let minIdDiff = Infinity;
                                       for (let i = 0; i < currentChapter.parsedElements.length; i++) {
                                           const el = currentChapter.parsedElements[i];
                                           if (el.sourceParaIds && el.sourceParaIds.length > 0) {
                                               const d = Math.abs(el.sourceParaIds[0] - pIdx);
                                               if (d < minIdDiff) { minIdDiff = d; nearestCard = i; }
                                           }
                                       }
                                       targetCardIdx = nearestCard;
                                   }
                                   cards.forEach((c, idx) => c.classList.toggle('active-card', idx === targetCardIdx));
                                   hoveredCardRef.current = targetCardIdx;
                                 }}
                                 onMouseLeave={() => {
                                   if (!syncScroll) return;
                                   hoveredCardRef.current = null;
                                 }}
                                 className={`text-sm leading-relaxed transition-all duration-700 font-medium italic ${syncScroll ? 'opacity-20 hover:opacity-100 [&.active]:opacity-100 [&.active]:text-sky-500 [&.active]:font-black [&.active]:underline [&.active]:decoration-sky-500/30 [&.active]:underline-offset-4 [&.active]:scale-[1.02] origin-left' : 'opacity-80'}`}
                                 data-para-index={pIdx}
                               >
                                 {para}
                               </p>
                             ))}
                           </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    
                    <div className={`flex-1 flex flex-col border ${theme === 'light' ? 'border-sky-200 shadow-sky-100/30' : 'border-sky-500/20 shadow-sky-950/20'} rounded-[3rem] ${theme === 'light' ? 'bg-white shadow-2xl' : 'bg-slate-900/10 shadow-2xl'} overflow-hidden relative`}>
                       <div className={`px-10 py-5 border-b ${theme === 'light' ? 'border-sky-50 bg-sky-50/30' : 'border-sky-500/10 bg-sky-950/30'} flex justify-between items-center shrink-0`}>
                          <div className="flex items-center gap-6">
                             <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black italic opacity-40 uppercase tracking-[0.3em]">Production Workbench</span>
                                <div className="flex items-center gap-2 px-3 py-1 bg-sky-500/10 rounded-full border border-sky-500/20">
                                   <input type="checkbox" checked={syncScroll} onChange={() => setSyncScroll(!syncScroll)} className="w-3 h-3 rounded bg-sky-500 cursor-pointer" />
                                   <span className="text-[8px] font-black text-sky-500 uppercase tracking-widest ml-1 cursor-pointer">Sync Scroll {syncScroll ? 'On' : 'Off'}</span>
                                </div>
                             </div>
                          </div>
                          <div className="flex items-center gap-4">
                             <span className="text-[9px] font-black opacity-30 uppercase tracking-[0.2em]">Chapter Nodes: {currentChapter.parsedElements.length}</span>
                          </div>
                       </div>
                       <Reorder.Group 
                        axis="y"
                        values={currentChapter.parsedElements}
                        onReorder={reorderScriptElements}
                        ref={scriptScrollRef}
                        onScroll={handleScriptScroll}
                        className="flex-1 p-10 overflow-y-auto space-y-3 scrollbar-hide pb-24"
                       >
                          {currentChapter.parsedElements.map((el) => (
                            <Reorder.Item 
                              key={el.id} 
                              value={el}
                              onMouseEnter={() => {
                                  if (!syncScroll) return;
                                  const idx = currentChapter.parsedElements.findIndex(e => e.id === el.id);
                                  hoveredCardRef.current = idx;
                                  applyHighlights(idx);
                              }}
                              onMouseLeave={() => {
                                  if (!syncScroll) return;
                                  hoveredCardRef.current = null;
                              }}
                              className={`script-card group relative overflow-hidden transition-all duration-500 rounded-3xl border ${el.type === 'sound_effect' ? (theme === 'light' ? 'bg-amber-50/50 border-amber-200' : 'bg-amber-500/5 border-amber-500/20') : (theme === 'light' ? 'bg-white border-slate-100 shadow-sm' : 'bg-white/[0.02] border-white/5')} ${syncScroll ? '[&.active-card]:ring-2 [&.active-card]:ring-sky-500/40 [&.active-card]:border-sky-400 [&.active-card]:scale-[1.01] [&.active-card]:shadow-xl [&.active-card]:opacity-100 opacity-40 hover:opacity-100' : 'opacity-100'}`}
                            >
                               <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-sky-500 opacity-0 group-[.active-card]:opacity-100 transition-opacity duration-500" />
                               
                               <div className="p-8">
                                  <div className="flex items-center justify-between mb-4">
                                     <div className="flex items-center gap-4">
                                        <div className={`p-1.5 rounded-lg ${theme === 'light' ? 'bg-slate-100' : 'bg-white/5'} opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing`}>
                                           <GripVertical className="w-3.5 h-3.5 opacity-30" />
                                        </div>
                                        <span className={`text-[9px] font-black px-4 py-1.5 rounded-full shadow-sm tracking-[0.1em] uppercase ${el.type === 'narration' ? 'bg-sky-600 text-white' : el.type === 'sound_effect' ? 'bg-amber-500 text-black' : 'bg-pink-600 text-white'}`}>{el.type === 'dialogue' ? el.speaker : el.type === 'narration' ? '旁白' : '音效'}</span>
                                        <span className={`font-mono font-black uppercase tracking-tighter ${el.type === 'sound_effect' ? 'text-sm opacity-60' : 'text-[10px] opacity-20'}`}>// {el.meta}</span>
                                     </div>
                                     <button onClick={() => setEditingElementId(editingElementId === el.id ? null : el.id)} className={`p-2 rounded-xl transition-all ${theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-white/10'} opacity-0 group-hover:opacity-100`}>
                                        <Pencil className={`w-3.5 h-3.5 ${editingElementId === el.id ? 'text-sky-500' : 'opacity-30'}`} />
                                     </button>
                                  </div>

                                  {editingElementId === el.id ? (
                                    <textarea 
                                      autoFocus
                                      value={el.content}
                                      onChange={(e) => updateScriptElement(el.id, { content: e.target.value })}
                                      onBlur={() => setEditingElementId(null)}
                                      className={`w-full bg-transparent !border-none !outline-none !ring-0 !shadow-none p-0 text-lg leading-relaxed ${theme === 'light' ? 'text-slate-900' : 'text-white'} resize-none font-medium h-auto min-h-[100px]`}
                                    />
                                  ) : (
                                    <p onClick={() => setEditingElementId(el.id)} className={`cursor-text ${el.type === 'dialogue' ? `text-lg font-medium leading-relaxed ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'}` : el.type === 'sound_effect' ? `text-lg italic font-black ${theme === 'light' ? 'text-amber-700' : 'text-amber-400'}` : `text-lg font-medium leading-relaxed opacity-60 italic ${theme === 'light' ? 'text-slate-800' : 'text-slate-300'}`}`}>
                                      {el.content || (el.type === 'sound_effect' ? '' : '')}
                                    </p>
                                  )}
                               </div>
                            </Reorder.Item>
                          ))}
                        </Reorder.Group>
                        {currentChapter.parsedElements.length === 0 && (
                          <div className="h-full flex flex-col items-center justify-center gap-8 opacity-[0.03] grayscale mt-20">
                             <PlayCircle className="w-48 h-48 stroke-[1px]" /><p className="text-xl font-black uppercase tracking-[1.5em] leading-none ml-[1.5em] text-current">Ready</p>
                          </div>
                        )}
                       </div>
                    </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {editingCharId && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-6">
           <div className={`w-full max-w-xl rounded-[4rem] p-16 shadow-2xl relative overflow-hidden ${theme === 'light' ? 'bg-white text-slate-900' : 'bg-slate-900 text-white border border-white/10'}`}>
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-sky-500 via-sky-300 to-sky-600" />
              <button onClick={() => setEditingCharId(null)} className="absolute top-12 right-12 opacity-30 hover:opacity-100 transition-all text-current"><Plus className="w-12 h-12 rotate-45" /></button>
              <h2 className="text-4xl font-black italic mb-12 tracking-tighter">Edit Persona / 精修建模</h2>
              <div className="space-y-10">
                 <div className="grid grid-cols-2 gap-10">
                    <div className="space-y-3"><label className="text-[10px] font-black opacity-40 uppercase tracking-[0.3em] ml-2">Display Name</label><input className={`w-full border rounded-[2rem] p-6 text-sm font-black focus:border-sky-500 outline-none transition-all ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-black/40 border-white/5'}`} value={characters.find(c => c.id === editingCharId)?.name} onChange={e => setCharacters(prev => prev.map(c => c.id === editingCharId ? { ...c, name: e.target.value } : c))} /></div>
                    <div className="space-y-3"><label className="text-[10px] font-black opacity-40 uppercase tracking-[0.3em] ml-2">Type Guard</label><input className={`w-full border rounded-[2rem] p-6 text-sm font-black focus:border-sky-500 outline-none transition-all ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-black/40 border-white/5'}`} value={`${characters.find(c => c.id === editingCharId)?.gender}/${characters.find(c => c.id === editingCharId)?.age}`} onChange={e => {
                       const parts = e.target.value.split("/");
                       const g = parts[0] || "";
                       const a = parts[1] || "";
                       setCharacters(prev => prev.map(c => c.id === editingCharId ? { ...c, gender: g, age: a } : c));
                    }} /></div>
                 </div>
                 <div className="space-y-3"><label className="text-[10px] font-black opacity-40 uppercase tracking-[0.3em] ml-2">Tone Instruction</label><input className={`w-full border rounded-[2rem] p-6 text-sm font-black focus:border-sky-500 outline-none transition-all ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-black/40 border-white/5'}`} value={characters.find(c => c.id === editingCharId)?.tone} onChange={e => setCharacters(prev => prev.map(c => c.id === editingCharId ? { ...c, tone: e.target.value } : c))} /></div>
                 <div className="space-y-3"><label className="text-[10px] font-black opacity-40 uppercase tracking-[0.3em] ml-2">Actor Profile Instruction</label><textarea className={`w-full h-44 border rounded-[2.5rem] p-6 text-sm resize-none scrollbar-hide focus:border-sky-500 outline-none transition-all leading-relaxed ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-black/40 border-white/5'}`} value={characters.find(c => c.id === editingCharId)?.description} onChange={e => setCharacters(prev => prev.map(c => c.id === editingCharId ? { ...c, description: e.target.value } : c))} /></div>
              </div>
              <button onClick={() => setEditingCharId(null)} className={`w-full h-20 ${theme === 'light' ? 'bg-slate-900 text-white' : 'bg-white text-slate-950'} rounded-[2.5rem] mt-12 font-black shadow-2xl transition-all uppercase tracking-widest text-sm hover:translate-y-[-4px]`}>Submit Refinement</button>
           </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
           <div className={`w-full max-w-2xl flex flex-col rounded-[2.5rem] p-8 lg:p-10 shadow-2xl relative ${theme === 'light' ? 'bg-white text-slate-900' : 'bg-slate-900 text-white border border-white/10'}`}>
              <div className="flex justify-between items-center mb-8">
                 <div>
                    <h2 className="text-3xl font-black italic tracking-tighter">Settings / 全局配置</h2>
                    <p className="text-sm opacity-50 font-bold mt-1 uppercase tracking-widest">Model & System Configuration</p>
                 </div>
                 <button onClick={() => setShowSettingsModal(false)} className="p-3 bg-black/5 hover:bg-black/10 rounded-full transition-all"><Plus className="w-6 h-6 rotate-45" /></button>
              </div>

              <div className="space-y-8">
                <div className={`p-6 rounded-[1.5rem] border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                   <div className="flex items-center gap-3 mb-5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme === 'light' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-indigo-500 text-white'}`}><Sparkles className="w-5 h-5" /></div>
                      <div>
                         <h3 className="font-black text-lg">AI Model / 推理大模型</h3>
                         <p className="text-xs opacity-60 font-bold">选择用于生成剧本的底层模型，影响生成速度和质量。</p>
                      </div>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                     {[
                       { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite", desc: "速度最快" },
                       { id: "gemini-3-flash-preview", name: "Gemini 3.0 Flash", desc: "日常任务首选" },
                       { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", desc: "高复杂推理" },
                       { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet", desc: "代码与长文" },
                       { id: "gpt-4o", name: "GPT-4o", desc: "均衡/综合强" },
                       { id: "deepseek-chat", name: "DeepSeek V3", desc: "平价长文本" },
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
                </div>

                <div className={`p-6 rounded-[1.5rem] border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                   <div className="flex items-center gap-3 mb-5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme === 'light' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-emerald-500 text-white'}`}><Zap className="w-5 h-5" /></div>
                      <div>
                         <h3 className="font-black text-lg">自定义 API 配置 (Custom Proxy & Keys)</h3>
                         <p className="text-xs opacity-60 font-bold">填入代理地址或其它厂商的 API Key。此配置优先于平台设定。</p>
                      </div>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                     <div className="flex flex-col gap-2">
                       <label className="text-[10px] font-black uppercase tracking-widest opacity-50">API Base URL</label>
                       <input 
                         type="text" 
                         placeholder="默认官方 (适用OneAPI转发)" 
                         value={localBaseUrl}
                         onChange={(e) => setLocalBaseUrl(e.target.value)}
                         className={`w-full px-4 py-3 rounded-xl border transition-all text-sm font-mono ${theme === 'light' ? 'bg-white border-slate-200 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20' : 'bg-black/20 border-white/10 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'} outline-none`} 
                       />
                     </div>
                     <div className="flex flex-col gap-2">
                       <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Custom API Key</label>
                       <input 
                         type="password" 
                         placeholder="填入即可覆盖系统默认额度" 
                         value={localApiKey}
                         onChange={(e) => setLocalApiKey(e.target.value)}
                         className={`w-full px-4 py-3 rounded-xl border transition-all text-sm font-mono ${theme === 'light' ? 'bg-white border-slate-200 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20' : 'bg-black/20 border-white/10 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'} outline-none`} 
                       />
                     </div>
                   </div>

                   <div className="flex items-center justify-between pt-5 border-t border-emerald-500/10">
                     <div className="flex items-center gap-2">
                        {localApiKey || localBaseUrl ? (
                          <div className="px-3 py-1 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-full text-[10px] font-black flex items-center gap-1 uppercase tracking-widest">
                             <CheckCircle2 className="w-3 h-3" /> Custom Config Active
                          </div>
                        ) : hasCustomApiKey ? (
                          <div className="px-3 py-1 bg-sky-500/10 text-sky-600 border border-sky-500/20 rounded-full text-[10px] font-black flex items-center gap-1 uppercase tracking-widest">
                             <CheckCircle2 className="w-3 h-3" /> AI Studio Secure Key Active
                          </div>
                        ) : (
                          <div className="px-3 py-1 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-full text-[10px] font-black flex items-center gap-1 uppercase tracking-widest">
                             <AlertCircle className="w-3 h-3" /> Default Pool Quota
                          </div>
                        )}
                     </div>
                     {!localApiKey && (
                       <button 
                         onClick={async () => {
                           if (window.aistudio?.openSelectKey) {
                             await window.aistudio.openSelectKey();
                             setHasCustomApiKey(true);
                           } else {
                             alert('该功能仅在实际部署环境中可用，或者您可以直接在上方输入 Custom API Key');
                           }
                         }}
                         className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-sm ${theme === 'light' ? 'bg-slate-900 text-white hover:bg-emerald-600' : 'bg-emerald-500 text-white hover:bg-emerald-400'}`}
                       >
                         {hasCustomApiKey ? '更改平台安全 Key' : '绑定平台安全 Key'}
                       </button>
                     )}
                   </div>
                </div>
              </div>
           </div>
        </div>
      )}

      {showExportModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
           <div className={`w-full max-w-lg flex flex-col rounded-[2rem] p-8 shadow-2xl relative ${theme === 'light' ? 'bg-white text-slate-900' : 'bg-slate-900 text-white border border-white/10'}`}>
              <div className="flex justify-between items-center mb-8">
                 <h2 className="text-2xl font-black italic tracking-tighter">Export Script</h2>
                 <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-black/10 rounded-full transition-all"><Plus className="w-6 h-6 rotate-45" /></button>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-black mb-3 opacity-60 uppercase tracking-widest">Scope / 导出范围</label>
                <div className="flex gap-3">
                  <button onClick={() => setExportScope('single')} className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold transition-all ${exportScope === 'single' ? 'border-sky-500 text-sky-500 bg-sky-500/10' : `border-transparent ${theme === 'light' ? 'bg-slate-100 text-slate-600' : 'bg-white/5 text-slate-400'}`}`}>
                    当前章节
                  </button>
                  <button onClick={() => setExportScope('all')} className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold transition-all ${exportScope === 'all' ? 'border-sky-500 text-sky-500 bg-sky-500/10' : `border-transparent ${theme === 'light' ? 'bg-slate-100 text-slate-600' : 'bg-white/5 text-slate-400'}`}`}>
                    全本合并
                  </button>
                </div>
              </div>

              <div className="mb-8">
                <label className="block text-sm font-black mb-3 opacity-60 uppercase tracking-widest">Format / 文件格式</label>
                <div className="flex flex-col gap-3">
                  <button onClick={() => setExportFormat('txt')} className={`text-left flex items-center justify-between p-4 rounded-xl border-2 transition-all ${exportFormat === 'txt' ? 'border-amber-500 bg-amber-500/10' : `border-transparent ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200' : 'bg-white/5 hover:bg-white/10'}`}`}>
                    <div>
                      <div className="font-bold">纯文本 (.txt)</div>
                      <div className="text-xs opacity-60 mt-1">标准格式，不带任何样式</div>
                    </div>
                  </button>
                  <button onClick={() => setExportFormat('word')} className={`text-left flex items-center justify-between p-4 rounded-xl border-2 transition-all ${exportFormat === 'word' ? 'border-sky-500 bg-sky-500/10' : `border-transparent ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200' : 'bg-white/5 hover:bg-white/10'}`}`}>
                    <div>
                      <div className="font-bold">Word 文档兼容富文本 (.doc)</div>
                      <div className="text-xs opacity-60 mt-1">带有颜色区分的呈现格式，可用于汇报或审阅</div>
                    </div>
                  </button>
                  <button onClick={() => setExportFormat('markdown')} className={`text-left flex items-center justify-between p-4 rounded-xl border-2 transition-all ${exportFormat === 'markdown' ? 'border-emerald-500 bg-emerald-500/10' : `border-transparent ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200' : 'bg-white/5 hover:bg-white/10'}`}`}>
                    <div>
                      <div className="font-bold">Markdown (.md)</div>
                      <div className="text-xs opacity-60 mt-1">适合导入富文本编辑器或其他支持Markdown的系统</div>
                    </div>
                  </button>
                </div>
              </div>

              <button onClick={executeExport} className={`w-full py-4 rounded-xl font-black shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${theme === 'light' ? 'bg-slate-900 text-white hover:bg-sky-600' : 'bg-sky-500 text-white hover:bg-sky-400'}`}>
                <Download className="w-5 h-5" /> 立即导出 (Execute Export)
              </button>
           </div>
        </div>
      )}

      {showProjectModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-6">
           <div className={`w-full max-w-6xl h-[85vh] flex flex-col rounded-[3rem] p-10 lg:p-12 shadow-2xl relative overflow-hidden ${theme === 'light' ? 'bg-white text-slate-900' : 'bg-slate-900 text-white border border-white/10'}`}>
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-sky-500 via-sky-300 to-sky-600" />
              <button onClick={() => setShowProjectModal(false)} className="absolute top-8 right-8 p-3 bg-black/10 hover:bg-black/20 rounded-full transition-all z-10 text-current"><Plus className="w-8 h-8 rotate-45" /></button>
              
              <div className="flex justify-between items-start mb-12">
                <div>
                  <h2 className="text-4xl font-black italic tracking-tighter leading-none mb-3">Vault / 项目中台</h2>
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-1 bg-sky-500/10 text-sky-500 text-[8px] font-black rounded-full border border-sky-500/20 uppercase tracking-widest">Master Repository</div>
                    <span className="text-[9px] opacity-30 font-black uppercase tracking-widest leading-none">Global session storage active</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveAsProject} className={`px-6 py-3 ${theme === 'light' ? 'bg-amber-500' : 'bg-amber-600'} rounded-xl text-[10px] font-black text-white flex items-center gap-2 hover:translate-y-[-2px] transition-all shadow-xl`}>
                    <Copy className="w-3.5 h-3.5" /> 另存为新项目
                  </button>
                  <label className={`cursor-pointer px-6 py-3 ${theme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-900' : 'bg-black/40 border-white/5 text-white'} border rounded-xl text-[10px] font-black flex items-center gap-2 hover:bg-sky-500 hover:text-white transition-all shadow-lg active:translate-y-0.5`}>
                    <Upload className="w-3.5 h-3.5" /> 导入项目
                    <input type="file" accept=".json" className="hidden" onChange={handleImportProject} />
                  </label>
                  <button onClick={createNewProject} className={`px-6 py-3 ${currentTheme.btn} rounded-xl text-[10px] font-black text-white flex items-center gap-2 hover:translate-y-[-2px] transition-all shadow-xl`}>
                    <Plus className="w-3.5 h-3.5" /> 启动全新剧作
                  </button>
                </div>
              </div>

              <div className="flex-1 flex gap-8 overflow-hidden min-h-0">
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="text-[9px] font-black opacity-30 uppercase tracking-[0.4em] mb-4 ml-1 italic">Stored Creations / 已存档 ({savedProjects.length})</div>
                  <div className="flex-1 overflow-y-auto space-y-3 pr-4 scrollbar-hide pb-8">
                    {savedProjects.length === 0 ? (
                      <div className={`h-full flex flex-col items-center justify-center gap-6 ${theme === 'light' ? 'bg-slate-50' : 'bg-black/10'} rounded-[2.5rem] border-2 border-dashed ${theme === 'light' ? 'border-slate-200' : 'border-white/5'}`}>
                        <div className="relative">
                          <FolderOpen className="w-24 h-24 stroke-[0.5px] opacity-10" />
                          <div className="absolute inset-0 flex items-center justify-center"><Plus className="w-8 h-8 text-sky-500 opacity-20 animate-pulse" /></div>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-[0.5em] opacity-20 ml-[0.5em]">No Data in Vault</p>
                      </div>
                    ) : (
                      savedProjects.map(p => (
                        <div key={p.id} className={`group p-6 rounded-[2rem] border transition-all flex items-center justify-between ${projectId === p.id ? 'bg-sky-500/10 border-sky-500/40 shadow-inner' : `border-transparent ${theme === 'light' ? 'bg-slate-50 hover:bg-white hover:shadow-xl' : 'bg-black/20 hover:bg-black/40'}`}`}>
                          <div className="flex items-center gap-6">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${projectId === p.id ? 'bg-sky-500 text-white shadow-xl rotate-3' : 'bg-black/10 text-slate-500 group-hover:rotate-[-3deg]'}`}>
                              <FileJson className="w-7 h-7" />
                            </div>
                            <div>
                              <h4 className="text-lg font-black italic tracking-tighter mb-0.5">{p.name}</h4>
                              <div className="flex items-center gap-3 text-[9px] font-black opacity-30 uppercase tracking-widest italic">
                                <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {new Date(p.lastModified).toLocaleDateString()}</span>
                                <span>• {p.chapters.length} CHS</span>
                                <span>• {p.characters.length} CAST</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                             {projectId !== p.id && <button onClick={() => loadProject(p)} className={`px-5 py-2.5 ${theme === 'light' ? 'bg-slate-900 text-white' : 'bg-white text-slate-950'} rounded-lg text-[10px] font-black hover:scale-105 active:scale-95 transition-all shadow-lg`}>LOAD</button>}
                             <button onClick={() => exportProjectToJSON(p)} className={`p-2.5 rounded-lg ${theme === 'light' ? 'bg-white shadow-md' : 'bg-white/10'} hover:text-sky-500 transition-all`} title="导出"><Download className="w-4 h-4" /></button>
                             <button onClick={() => deleteProject(p.id)} className={`p-2.5 rounded-lg ${theme === 'light' ? 'bg-white shadow-md' : 'bg-white/10'} hover:text-red-500 transition-all`} title="删除"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="w-68 hidden xl:flex flex-col gap-5 shrink-0">
                   <div className={`p-8 rounded-[2.5rem] ${theme === 'light' ? 'bg-sky-50 text-sky-900 border-sky-100' : 'bg-sky-500/5 text-sky-400 border-sky-500/20'} border flex flex-col min-h-0 h-full overflow-hidden`}>
                      <span className="text-[9px] font-black uppercase tracking-widest mb-6 block italic">Vitals</span>
                      <div className="space-y-8 flex-1 overflow-y-auto scrollbar-hide pr-2">
                         <div><div className="text-3xl font-black italic tracking-tighter leading-none mb-1">98%</div><div className="text-[8px] font-black opacity-40 uppercase">Consistency</div></div>
                         <div><div className="text-3xl font-black italic tracking-tighter leading-none mb-1">{savedProjects.length}</div><div className="text-[8px] font-black opacity-40 uppercase">Total Items</div></div>
                         <div className="pt-4 border-t border-sky-500/10">
                            <h4 className="text-[9px] font-black opacity-60 uppercase mb-3">Recent Activity</h4>
                            <div className="space-y-3">
                               {savedProjects.slice(0, 3).map(p => (
                                 <div key={p.id} className="text-[10px] font-bold opacity-40 truncate flex items-center gap-2">
                                    <Clock className="w-3 h-3" /> {p.name}
                                 </div>
                               ))}
                            </div>
                         </div>
                      </div>
                      <div className="mt-8 pt-6 border-t border-sky-500/10 shrink-0">
                         <div className="h-1 w-full bg-sky-500/20 rounded-full overflow-hidden mb-3"><div className="h-full bg-sky-500 w-2/3" /></div>
                         <p className="text-[8px] font-bold opacity-50 uppercase tracking-tighter italic leading-relaxed">Local pulse is synchronized with browser cache.</p>
                      </div>
                   </div>
                </div>
              </div>
              
              {projectId && (
                <div className={`mt-8 p-8 rounded-[3rem] ${theme === 'light' ? 'bg-slate-50 border-slate-100 shadow-inner' : 'bg-black/30 border-white/5'} border flex justify-between items-center shrink-0`}>
                  <div className="flex items-center gap-5">
                    <div className="w-3.5 h-3.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_12px_rgba(34,197,94,0.5)]" />
                    <div>
                      <p className="text-[8px] font-black opacity-30 uppercase tracking-widest mb-0.5 italic">Active production slot</p>
                      <p className="text-xl font-black italic tracking-tighter">{projectName}</p>
                    </div>
                  </div>
                  <button onClick={saveCurrentProject} className={`px-10 py-4 ${currentTheme.btn} rounded-2xl text-[10px] font-black text-white shadow-xl hover:translate-y-[-4px] active:translate-y-0 transition-all flex items-center gap-3`}>
                    <Save className="w-4 h-4" /> <span>同步当前所有变更</span>
                  </button>
                </div>
              )}
           </div>
        </div>
      )}

      <AnimatePresence>
        {showSaveToast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-16 right-10 z-[1001] px-6 py-4 bg-sky-600 text-white rounded-2xl shadow-2xl flex items-center gap-3 border border-white/20">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-xs font-black uppercase tracking-widest">Project Synced Successfully</span>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`fixed bottom-12 left-1/2 -translate-x-1/2 px-10 py-5 bg-red-600 text-white rounded-[2rem] flex items-center gap-5 backdrop-blur-3xl z-[300] shadow-2xl border border-white/10 uppercase font-black text-xs tracking-widest`}>
           <AlertCircle className="w-5 h-5 fill-white text-red-600" />
           <span>{error}</span>
           <button onClick={() => setError(null)} className="px-5 py-2 bg-black/40 rounded-xl hover:bg-black/60 transition-all font-mono tracking-normal">DISMISS</button>
        </motion.div>
      )}

      <footer className={`h-10 ${theme === 'light' ? 'bg-slate-200 text-slate-500' : 'bg-slate-950 text-slate-800'} border-t ${currentTheme.border} flex items-center justify-between px-10 text-[9px] font-mono tracking-[0.5em] uppercase pointer-events-none transition-colors shrink-0`}>
         <div>VoxStudio Pro Build v4.8.2 | Environment Stable</div>
         <div className="flex gap-10"><span>AI Rendering Agent: Online</span><span>Production Pipeline: Ready</span></div>
      </footer>
    </div>
  );
}
