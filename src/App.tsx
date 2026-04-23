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
  Eye, EyeOff, Maximize2, Minimize2, Palette, Sun, Moon, Leaf
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// --- 初始化 AI ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
}

interface Chapter {
  id: string;
  title: string;
  novelText: string;
  scriptText: string;
  parsedElements: ScriptElement[];
}

type ProductionStyle = "都市言情" | "热血玄幻" | "悬疑惊悚" | "技术专业" | "温馨治愈";
type Theme = "dark" | "light" | "forest";

export default function App() {
  // --- 持久化核心状态 ---
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
  const [theme, setTheme] = useState<Theme>("dark");

  // --- UI 控制状态 ---
  const [activeTab, setActiveTab] = useState<"book" | "cast" | "studio">("book");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSource, setShowSource] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);

  const currentChapter = chapters.find(c => c.id === currentChapterId) || chapters[0];

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
      const match = line.match(/^【(.*?)】[：: ]?(.*)$/);
      if (match) {
        const speaker = match[1].trim();
        const fullContent = match[2].trim();
        const metaMatch = fullContent.match(/\((.*?)\)|（(.*?)）/);
        const meta = metaMatch ? (metaMatch[1] || metaMatch[2]) : "自然";
        const content = fullContent.replace(/\(.*?\)|（.*?）/, "").trim();
        let type: "narration" | "dialogue" | "sound_effect" = "dialogue";
        if (speaker === "旁白") type = "narration";
        if (speaker.includes("场景音") || speaker.includes("环境音") || speaker.includes("音效")) type = "sound_effect";
        elements.push({ id: `el-${Date.now()}-${i}`, type, meta, content, speaker: type === "dialogue" ? speaker : undefined });
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
      const systemInstruction = `你是有声书改编专家。风格：${prodStyle}。基准语速：${readingSpeed} WPM。\n全局人设表：\n${charPrompt}\n任务：将小说对白与环境描写转化为有声书剧本。\n严格格式：\n【旁白】：（情感指令）内容\n【角色名】：（情感指令）内容\n【场景音】：（音效描述）\n要求：保留原文完整情节，增强对话张力，直接输出剧本，不要任何 Markdown 标记。`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: currentChapter.novelText }] }],
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
      const prompt = `你是一个资深文学编辑。请提取小说全部角色。输出严格 JSON 数组格式：[{"name":"姓名","gender":"性别","age":"年龄段","tone":"建议音色","description":"性格特征"}]\n文本：\n${sample}`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });
      const extracted = JSON.parse(response.text || "[]");
      const existing = new Set(characters.map(c => c.name));
      const fresh = extracted.filter((c: any) => !existing.has(c.name)).map((c: any, i: number) => ({ ...c, id: `char-${Date.now()}-${i}` }));
      setCharacters(prev => [...prev, ...fresh]);
      setActiveTab("cast");
    } catch (e: any) { setError(`建模失败：${e.message}`); } finally { setIsProcessing(false); }
  };

  const handleExportSingle = () => {
    if (!currentChapter.scriptText) return;
    const blob = new Blob([currentChapter.scriptText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName}_${currentChapter.title}.txt`;
    a.click();
  };

  const handleExportMerged = () => {
    const generatedChapters = chapters.filter(c => c.scriptText.trim() !== "");
    if (generatedChapters.length === 0) { setError("没有可导出的已生成剧本"); return; }
    const mergedContent = generatedChapters.map(c => `================ ${c.title} ================\n\n${c.scriptText}\n\n`).join("\n");
    const blob = new Blob([mergedContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName}_合并.txt`;
    a.click();
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
          <div className="flex flex-col">
            <span className="text-[9px] font-black opacity-30 uppercase mb-0.5 tracking-tighter">Project / 剧本总称</span>
            <input className="bg-transparent border-none outline-none text-sm font-black focus:text-sky-400 transition-colors w-44" value={projectName} onChange={e => setProjectName(e.target.value)} />
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
          <div className="flex gap-2">
            <button disabled={!currentChapter.scriptText} onClick={handleExportSingle} className={`px-4 py-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800'} border ${currentTheme.border} rounded-xl text-xs font-black flex items-center gap-2 hover:opacity-80 transition-all disabled:opacity-20`}><Download className="w-3.5 h-3.5" /> 导出本章</button>
            <button onClick={handleExportMerged} className="px-4 py-2 bg-white text-slate-950 rounded-xl text-xs font-black shadow-lg flex items-center gap-2 hover:bg-sky-50 transition-all active:scale-95 text-nowrap"><Download className="w-3.5 h-3.5" /> 全本合并</button>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        {/* 左侧侧边栏 */}
        <aside className={`w-64 border-r ${currentTheme.border} ${currentTheme.sidebar} flex flex-col shrink-0 transition-colors`}>
          <div className={`p-5 flex justify-between items-center ${theme === 'light' ? 'bg-slate-200/50' : 'bg-slate-950/20'} border-b ${currentTheme.border}`}>
            <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">Directory / 章节</span>
            <button onClick={() => { const id = `ch-${Date.now()}`; setChapters([...chapters, { id, title: "新章节文本", novelText: "", scriptText: "", parsedElements: [] }]); setCurrentChapterId(id); }} className="p-1.5 text-sky-500 hover:bg-sky-500/10 rounded-lg transition-all"><Plus className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-hide">
            {chapters.map((ch, idx) => (
              <div key={ch.id} onClick={() => setCurrentChapterId(ch.id)} className={`group relative p-4 rounded-2xl cursor-pointer border transition-all ${currentChapterId === ch.id ? (theme === 'light' ? 'bg-sky-500 text-white border-sky-600/20 shadow-lg' : 'bg-sky-600/10 border-sky-500/40 text-sky-400') : `border-transparent opacity-60 hover:opacity-100 ${theme === 'light' ? 'hover:bg-slate-200' : 'hover:bg-slate-900/50'}`}`}>
                <div className={`text-[8px] font-mono opacity-40 mb-1 ${currentChapterId === ch.id && theme === 'light' ? 'text-white' : ''}`}>CH-{(idx+1).toString().padStart(2,'0')}</div>
                <div className="text-xs font-black truncate pr-6">{ch.title}</div>
                {ch.scriptText && <div className={`absolute top-4 right-4 w-1.5 h-1.5 ${currentChapterId === ch.id && theme === 'light' ? 'bg-white' : 'bg-sky-500'} rounded-full`} />}
                <button onClick={(e) => { e.stopPropagation(); if(chapters.length > 1) setChapters(chapters.filter(c => c.id !== ch.id)) }} className={`absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg ${currentChapterId === ch.id && theme === 'light' ? 'text-white' : ''}`}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          <div className={`mt-auto p-6 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-950/40'} border-t ${currentTheme.border} space-y-4`}>
             <div className="flex justify-between items-center"><span className="text-[9px] font-black opacity-40 uppercase">Global Words</span><span className={`text-xs font-mono font-black ${currentTheme.accent}`}>{totalNovelWords.toLocaleString()}</span></div>
             <div className="flex justify-between items-center"><span className="text-[9px] font-black opacity-40 uppercase">Est. Runtime</span><span className={`text-xs font-mono font-black ${currentTheme.accent}`}>{totalScriptDuration.toFixed(1)} MIN</span></div>
          </div>
        </aside>

        <div className="flex-1 flex overflow-hidden relative">
          <AnimatePresence mode="wait">
            {activeTab === "book" && (
              <motion.div key="book" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col p-10 gap-8 overflow-hidden">
                <div className="flex justify-between items-end">
                  <div className="max-w-xl">
                    <h2 className="text-2xl font-black italic tracking-tighter">Asset Management / 资源管控</h2>
                    <p className="text-xs opacity-50 mt-1">上传章节 .txt 文件或在此录入。长文本将触发布局分割功能。</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => {
                        const input = document.createElement("input"); input.type = "file"; input.accept = ".txt";
                        input.onchange = (e: any) => { const r = new FileReader(); r.onload = (ev) => handleSplitImport(ev.target?.result as string); r.readAsText(e.target.files[0]); };
                        input.click();
                    }} className={`px-5 py-2.5 ${theme === 'light' ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-white/10'} border rounded-2xl text-[11px] font-black flex items-center gap-2 hover:border-sky-500 transition-all`}><Upload className="w-4 h-4" /> 批量导入</button>
                    <button onClick={extractCharacters} disabled={isProcessing || !currentChapter.novelText} className={`px-5 py-2.5 ${currentTheme.btn} rounded-2xl text-[11px] font-black shadow-xl hover:opacity-90 transition-all text-white flex items-center gap-2`}>
                       {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> 角色全书建模扫描</>}
                    </button>
                  </div>
                </div>
                <div className={`flex-1 w-full max-w-4xl mx-auto ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-white/10'} border rounded-[2.5rem] p-10 flex flex-col shadow-inner backdrop-blur-3xl relative overflow-hidden`}>
                   <input className="bg-transparent border-none outline-none text-xl font-black mb-8 p-0 w-full placeholder:opacity-10" placeholder="本章标题" value={currentChapter.title} onChange={e => updateChapterData({ title: e.target.value })} />
                   <textarea className={`w-full h-full bg-transparent resize-none border-none outline-none text-sm font-medium leading-relaxed scrollbar-hide whitespace-pre-wrap ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`} placeholder="小说内容..." value={currentChapter.novelText} onChange={e => {
                       const text = e.target.value;
                       if (currentChapter.novelText === "" && text.includes("第") && text.length > 2000) handleSplitImport(text);
                       else updateChapterData({ novelText: text });
                   }} />
                </div>
              </motion.div>
            )}

            {activeTab === "cast" && (
              <motion.div key="cast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col p-10 gap-10 overflow-hidden">
                 <div className="flex justify-between items-center px-4">
                    <h2 className="text-2xl font-black italic tracking-tighter">Cast Personnel / 角色人员库</h2>
                    <div className="flex items-center gap-6">
                       <div className="flex flex-col"><span className="text-[9px] font-black opacity-30 uppercase mb-2">Art Style</span><select className={`${theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-white/10 text-slate-300'} border rounded-xl px-4 py-1.5 text-[11px] font-black outline-none`} value={prodStyle} onChange={e => setProdStyle(e.target.value as any)}>{["都市言情", "热血玄幻", "悬疑惊悚", "技术专业", "温馨治愈"].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                       <div className="flex flex-col"><span className="text-[9px] font-black opacity-30 uppercase mb-2">Reading Pace</span><div className={`h-9 ${theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-white/5'} border rounded-xl flex items-center px-4 gap-3 shadow-inner`}><input type="range" min="150" max="400" step="10" className="w-32 accent-sky-500" value={readingSpeed} onChange={e => setReadingSpeed(Number(e.target.value))} /><span className={`text-[11px] font-mono font-black ${currentTheme.accent} w-8`}>{readingSpeed}</span></div></div>
                    </div>
                 </div>
                 <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto px-4 scrollbar-hide pb-20">
                    {characters.map(char => (
                      <div key={char.id} className={`${theme === 'light' ? 'bg-white shadow-xl shadow-slate-200/50 border-slate-100' : 'bg-slate-950 border-white/5 shadow-2xl shadow-black/20'} p-7 border rounded-[2rem] relative group hover:border-sky-500 transition-all flex flex-col min-h-[280px]`}>
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
                         <p className="text-xs opacity-60 line-clamp-4 leading-relaxed mb-6 flex-1 italic">{char.description}</p>
                         <div className={`mt-auto pt-5 border-t ${currentTheme.border}`}>
                            <div className="text-[10px] font-black opacity-30 uppercase tracking-widest mb-1.5">Voice Texture</div>
                            <div className={`text-[11px] font-bold ${currentTheme.accent} leading-tight`}>{char.tone}</div>
                         </div>
                      </div>
                    ))}
                    <button onClick={() => setCharacters([...characters, { id: `c-${Date.now()}`, name: "新演员", gender: "男", age: "青年", tone: "中性", description: "输入详细设定..." }])} className={`${theme === 'light' ? 'border-slate-200 shadow-sm' : 'border-slate-800 bg-black/5'} border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center transition-all group hover:border-sky-500 min-h-[280px]`}><Plus className="w-10 h-10 mb-3 group-hover:scale-110 group-hover:text-sky-500 transition-all opacity-20" /><span className="text-[9px] font-black uppercase tracking-[0.4em] opacity-30">Deploy Actor</span></button>
                 </div>
                 <button onClick={() => setActiveTab("studio")} className={`h-11 ${theme === 'light' ? 'bg-slate-900 text-white shadow-xl shadow-slate-200' : 'bg-white text-slate-950 shadow-2xl shadow-sky-900/20'} rounded-2xl font-black text-[11px] shadow-2xl flex items-center justify-center gap-4 hover:translate-y-[-3px] transition-all transform-gpu shrink-0`}>部署至演播室并开启自动化生产 <ChevronRight className="w-4 h-4" /></button>
              </motion.div>
            )}

            {activeTab === "studio" && (
              <motion.div key="studio" initial={{ opacity: 0, scale: 1.01 }} animate={{ opacity: 1, scale: 1 }} className={`flex-1 flex flex-col p-6 gap-6 overflow-hidden ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-950'}`}>
                 <div className="flex items-center justify-between px-8 py-4">
                    <div className="flex items-center gap-6">
                       <div className="flex flex-col"><span className={`text-[9px] font-black ${currentTheme.accent} uppercase tracking-widest mb-1 leading-none`}>Production Studio</span><span className="text-lg font-black truncate max-w-[320px] italic">{currentChapter.title}</span></div>
                    </div>
                    <button disabled={isProcessing || !currentChapter.novelText} onClick={runGeneration} className={`h-11 px-10 ${currentTheme.btn} rounded-2xl text-[11px] font-black shadow-2xl hover:brightness-110 transition-all flex items-center gap-4 active:scale-95 text-white transform-gpu`}>{isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-5 h-5 fill-white" /> 向 AI 发起演播生成指令</>}</button>
                 </div>

                 <div className="flex-1 flex gap-6 overflow-hidden">
                    <AnimatePresence>
                      {showSource && (
                        <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: "38%", opacity: 1 }} exit={{ width: 0, opacity: 0 }} className={`flex flex-col border ${currentTheme.border} rounded-[3rem] ${theme === 'light' ? 'bg-white shadow-2xl shadow-slate-200/50' : 'bg-slate-950/50 shadow-2xl shadow-black/40'} overflow-hidden shrink-0 relative`}>
                           <div className={`p-6 border-b ${currentTheme.border} flex justify-between items-center ${theme === 'light' ? 'bg-slate-50' : 'bg-black/40'}`}>
                              <span className="text-[10px] font-black opacity-30 uppercase tracking-[0.2em] italic">Original Asset</span>
                              <button onClick={() => setShowSource(false)} className={`p-2.5 rounded-xl transition-all ${theme === 'light' ? 'hover:bg-slate-100 text-slate-400' : 'hover:bg-white/10 text-slate-600'}`}><EyeOff className="w-5 h-5" /></button>
                           </div>
                           <textarea className="flex-1 p-10 bg-transparent resize-none border-none outline-none text-sm opacity-50 leading-relaxed scrollbar-hide whitespace-pre-wrap italic font-medium" value={currentChapter.novelText} readOnly />
                        </motion.div>
                      )}
                    </AnimatePresence>
                    
                    <div className={`flex-1 flex flex-col border ${theme === 'light' ? 'border-sky-200 shadow-sky-100/30' : 'border-sky-500/20 shadow-sky-950/20'} rounded-[3rem] ${theme === 'light' ? 'bg-white shadow-2xl' : 'bg-slate-900/10 shadow-2xl'} overflow-hidden relative`}>
                       <div className={`px-10 py-5 border-b ${theme === 'light' ? 'border-sky-50 bg-sky-50/30' : 'border-sky-500/10 bg-sky-950/30'} flex justify-between items-center`}>
                          <div className="flex items-center gap-6">
                             {!showSource && <button onClick={() => setShowSource(true)} className="p-3 bg-sky-500/10 text-sky-500 rounded-2xl hover:bg-sky-500/20 transition-all shadow-lg active:scale-95"><Eye className="w-5 h-5" /></button>}
                             <span className={`text-[10px] font-black ${theme === 'light' ? 'text-sky-700' : 'text-sky-400'} uppercase tracking-[0.5em] italic`}>Production workbench</span>
                          </div>
                          <div className="flex items-center gap-4"><span className="text-[9px] font-mono opacity-30 font-black">CHAPTER NODES: {currentChapter.parsedElements.length}</span></div>
                       </div>
                       <div className="flex-1 p-10 overflow-y-auto space-y-8 scrollbar-hide pb-24">
                          {currentChapter.parsedElements.map((el) => (
                            <div key={el.id} className={`p-10 rounded-[3rem] border transition-all duration-500 group relative ${el.type === 'sound_effect' ? (theme === 'light' ? 'bg-amber-50 border-amber-200 shadow-sm' : 'bg-amber-500/10 border-amber-500/30 ring-8 ring-amber-500/5') : (theme === 'light' ? 'bg-white border-slate-100 shadow-sm' : 'bg-white/[0.04] border-white/5')}`}>
                               <div className="flex items-center gap-5 mb-6">
                                  <span className={`text-[10px] font-black px-5 py-2 rounded-full shadow-lg tracking-[0.2em] uppercase ${el.type === 'narration' ? 'bg-sky-600 text-white' : el.type === 'sound_effect' ? 'bg-amber-500 text-black' : 'bg-pink-600 text-white'}`}>{el.type === 'dialogue' ? el.speaker : el.type === 'narration' ? '旁白' : '场景音效'}</span>
                                  <span className={`text-xs italic font-mono font-black opacity-30 ${theme === 'light' ? 'text-slate-900' : 'text-slate-400'} lowercase`}>{">"} {el.meta}</span>
                               </div>
                               <p className={`${el.type === 'dialogue' ? `text-lg font-black leading-relaxed ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'}` : el.type === 'sound_effect' ? `text-base italic font-black ${theme === 'light' ? 'text-amber-700' : 'text-amber-400'}` : `text-lg font-bold leading-relaxed opacity-60 italic ${theme === 'light' ? 'text-slate-800' : 'text-slate-300'}`}`}>{el.content}</p>
                            </div>
                          ))}
                          {currentChapter.parsedElements.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center gap-8 opacity-[0.03] grayscale mt-20">
                               <PlayCircle className="w-48 h-48 stroke-[1px]" /><p className="text-xl font-black uppercase tracking-[1.5em] leading-none ml-[1.5em] text-current">Ready</p>
                            </div>
                          )}
                       </div>
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
              <button onClick={() => setEditingCharId(null)} className="absolute top-12 right-12 opacity-30 hover:opacity-100 transition-all"><Plus className="w-12 h-12 rotate-45" /></button>
              <h2 className="text-4xl font-black italic mb-12 tracking-tighter">Edit Persona / 精修建模</h2>
              <div className="space-y-10">
                 <div className="grid grid-cols-2 gap-10">
                    <div className="space-y-3"><label className="text-[10px] font-black opacity-40 uppercase tracking-[0.3em] ml-2">Display Name</label><input className={`w-full border rounded-[2rem] p-6 text-sm font-black focus:border-sky-500 outline-none transition-all ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-black/40 border-white/5'}`} value={characters.find(c => c.id === editingCharId)?.name} onChange={e => setCharacters(prev => prev.map(c => c.id === editingCharId ? { ...c, name: e.target.value } : c))} /></div>
                    <div className="space-y-3"><label className="text-[10px] font-black opacity-40 uppercase tracking-[0.3em] ml-2">Type Guard</label><input className={`w-full border rounded-[2rem] p-6 text-sm font-black focus:border-sky-500 outline-none transition-all ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-black/40 border-white/5'}`} value={`${characters.find(c => c.id === editingCharId)?.gender}/${characters.find(c => c.id === editingCharId)?.age}`} onChange={e => {
                       const [g, a] = e.target.value.split("/");
                       setCharacters(prev => prev.map(c => c.id === editingCharId ? { ...c, gender: g || "", age: a || "" } : c));
                    }} /></div>
                 </div>
                 <div className="space-y-3"><label className="text-[10px] font-black opacity-40 uppercase tracking-[0.3em] ml-2">Tone Instruction</label><input className={`w-full border rounded-[2rem] p-6 text-sm font-black focus:border-sky-500 outline-none transition-all ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-black/40 border-white/5'}`} value={characters.find(c => c.id === editingCharId)?.tone} onChange={e => setCharacters(prev => prev.map(c => c.id === editingCharId ? { ...c, tone: e.target.value } : c))} /></div>
                 <div className="space-y-3"><label className="text-[10px] font-black opacity-40 uppercase tracking-[0.3em] ml-2">Actor Profile Instruction</label><textarea className={`w-full h-44 border rounded-[2.5rem] p-6 text-sm resize-none scrollbar-hide focus:border-sky-500 outline-none transition-all leading-relaxed ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-black/40 border-white/5'}`} value={characters.find(c => c.id === editingCharId)?.description} onChange={e => setCharacters(prev => prev.map(c => c.id === editingCharId ? { ...c, description: e.target.value } : c))} /></div>
              </div>
              <button onClick={() => setEditingCharId(null)} className={`w-full h-20 ${theme === 'light' ? 'bg-slate-900 text-white' : 'bg-white text-slate-950'} rounded-[2.5rem] mt-12 font-black shadow-2xl transition-all uppercase tracking-widest text-sm hover:translate-y-[-4px]`}>Submit Refinement</button>
           </div>
        </div>
      )}

      {error && (
        <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`fixed bottom-12 left-1/2 -translate-x-1/2 px-10 py-5 bg-red-600 text-white rounded-[2rem] flex items-center gap-5 backdrop-blur-3xl z-[300] shadow-2xl border border-white/10 uppercase font-black text-xs tracking-widest`}>
           <AlertCircle className="w-5 h-5 fill-white text-red-600" />
           <span>{error}</span>
           <button onClick={() => setError(null)} className="px-5 py-2 bg-black/40 rounded-xl hover:bg-black/60 transition-all font-mono tracking-normal">DISMISS</button>
        </motion.div>
      )}

      <footer className={`h-10 ${theme === 'light' ? 'bg-slate-200 text-slate-500' : 'bg-slate-950 text-slate-800'} border-t ${currentTheme.border} flex items-center justify-between px-10 text-[9px] font-mono tracking-[0.5em] uppercase pointer-events-none transition-colors`}>
         <div>VoxStudio Pro Build v4.8.2 | Environment Stable</div>
         <div className="flex gap-10"><span>AI Rendering Agent: Online</span><span>Production Pipeline: Ready</span></div>
      </footer>
    </div>
  );
}
