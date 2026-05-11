// src/components/studio/ScriptCard.tsx
import React, { memo, useState, useRef } from 'react';
import { AnimatePresence, motion } from "motion/react";
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Play, Square, Volume2, Pencil, Wand2, ChevronDown, ShieldAlert, X, SlidersHorizontal, Plus, Trash2, GripVertical, CheckCircle2, XCircle, ArrowUpFromLine, ArrowDownToLine, UserCircle } from 'lucide-react';
import { ScriptElement, Character, Theme, FontSize, ViewMode } from '../../types';

interface ScriptCardProps {
  element: ScriptElement;
  index: number;
  totalElements: number;
  isActive: boolean;
  isCompliantIssue: string[] | null;
  characters: Character[];
  theme: Theme;
  workspaceFontSize: FontSize;
  emotionGlowColor: string;
  syncScroll: boolean;
  playingId: string | null;
  editingElementId: string | null;
  inlineRewriteId: string | null;
  inlineRewritePrompt: string;
  viewMode: ViewMode;
  pendingDiff: ScriptElement | null;
  onAcceptDiff: (id: string) => void;
  onRejectDiff: (id: string) => void;
  onHover: (index: number | null) => void;
  onPlay: (text: string, id: string, speakerName?: string, index?: number) => void;
  onEdit: (id: string | null) => void;
  onRewriteStart: (id: string) => void;
  onRewriteCancel: () => void;
  onRewriteSubmit: (id: string) => void;
  onRewritePromptChange: (val: string) => void;
  onUpdateElement: (id: string, updates: Partial<ScriptElement>) => void;
  onSplitElement?: (id: string, textBefore: string, textAfter: string) => void;
  onMergeUpElement?: (id: string) => void;
  onMergeDownElement?: (id: string) => void;
  onReorder?: (startIndex: number, endIndex: number) => void;
  onDeleteElement?: (id: string) => void;
}

const fontSizeClass = { "sm": "text-sm", "base": "text-base", "lg": "text-lg" };
const teleprompterFontClass = { "sm": "text-3xl", "base": "text-5xl", "lg": "text-7xl" };

const AudioWaveform = () => (
  <div className="flex items-center justify-center gap-[3px] h-4 ml-3 opacity-80 shrink-0 pointer-events-none">
    {[1, 2, 3, 4].map((i) => (
      <motion.div
        key={i}
        className="w-[3px] bg-current rounded-full"
        animate={{ height: ["4px", "14px", "4px"] }}
        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
      />
    ))}
  </div>
);

const ScriptCard = ({
  element: el, index, totalElements, isActive, isCompliantIssue, characters, theme, workspaceFontSize,
  emotionGlowColor, syncScroll, playingId, editingElementId, inlineRewriteId, inlineRewritePrompt, viewMode,
  pendingDiff, onAcceptDiff, onRejectDiff,
  onHover, onPlay, onEdit, onRewriteStart, onRewriteCancel, onRewriteSubmit, onRewritePromptChange, onUpdateElement,
  onSplitElement, onMergeUpElement, onMergeDownElement, onReorder, onDeleteElement
}: ScriptCardProps) => {

  const [showTuning, setShowTuning] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [newPinyin, setNewPinyin] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const characterInfo = characters.find(c => c.name === el.speaker);
  const roleColor = characterInfo?.color || (el.type === 'narration' ? 'bg-slate-500' : el.type === 'sound_effect' ? 'bg-amber-500' : 'bg-sky-500');
  const avatarGradient = characterInfo?.avatarGradient || 'linear-gradient(135deg, #cbd5e1, #94a3b8)';

  const handleAddPronunciation = () => {
    if (!newWord || !newPinyin) return;
    const currentPro = el.pronunciations || {};
    onUpdateElement(el.id, { pronunciations: { ...currentPro, [newWord]: newPinyin } });
    setNewWord(""); setNewPinyin("");
  };

  const handleRemovePronunciation = (word: string) => {
    const currentPro = { ...el.pronunciations };
    delete currentPro[word];
    onUpdateElement(el.id, { pronunciations: currentPro });
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (onSplitElement && textareaRef.current) {
        const cursor = textareaRef.current.selectionStart;
        const text = textareaRef.current.value;
        const textBefore = text.slice(0, cursor);
        const textAfter = text.slice(cursor);
        onSplitElement(el.id, textBefore, textAfter);
      }
    } else if (e.key === 'Backspace' && textareaRef.current && textareaRef.current.selectionStart === 0 && textareaRef.current.selectionEnd === 0) {
      e.preventDefault();
      if (onMergeUpElement) onMergeUpElement(el.id);
    }
  };

  const [isDragOver, setIsDragOver] = useState(false);
  const [isDraggable, setIsDraggable] = useState(false);
  
  const handleDragStart = (e: React.DragEvent) => { 
    e.dataTransfer.effectAllowed = "move"; 
    e.dataTransfer.setData("text/plain", index.toString()); 
  };
  const handleDragOver = (e: React.DragEvent) => { 
    e.preventDefault(); 
    setIsDragOver(true); 
  };
  const handleDragLeave = () => { 
    setIsDragOver(false); 
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); 
    setIsDragOver(false);
    const draggedIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (draggedIndex !== index && onReorder) onReorder(draggedIndex, index);
  };

  const MenuContent = () => (
    <ContextMenu.Portal>
      <ContextMenu.Content className={`min-w-[200px] rounded-xl shadow-2xl border backdrop-blur-xl overflow-hidden py-1.5 z-[99999] ${theme === 'light' ? 'bg-white/95 border-slate-200 text-slate-700' : 'bg-slate-800/95 border-slate-700 text-slate-200'}`}>
        <ContextMenu.Item className="px-4 py-2.5 text-sm font-bold flex items-center gap-3 cursor-pointer hover:bg-sky-500 hover:text-white outline-none transition-colors" onClick={() => onPlay(el.content, el.id, el.speaker, index)}>
          <Volume2 className="w-4 h-4" /> 试听此句
        </ContextMenu.Item>
        <ContextMenu.Item className="px-4 py-2.5 text-sm font-bold flex items-center gap-3 cursor-pointer hover:bg-sky-500 hover:text-white outline-none transition-colors" onClick={() => onEdit(el.id)}>
          <Pencil className="w-4 h-4" /> 手动精修
        </ContextMenu.Item>
        <ContextMenu.Item className="px-4 py-2.5 text-sm font-bold flex items-center gap-3 cursor-pointer hover:bg-amber-500 hover:text-white outline-none transition-colors" onClick={() => onRewriteStart(el.id)}>
          <Wand2 className="w-4 h-4" /> AI 局部重写
        </ContextMenu.Item>
        
        <ContextMenu.Separator className={`h-px my-1 ${theme === 'light' ? 'bg-slate-200' : 'bg-slate-700'}`} />
        
        <ContextMenu.Sub>
          <ContextMenu.SubTrigger className={`px-4 py-2.5 text-sm font-bold flex items-center gap-3 cursor-pointer outline-none transition-colors justify-between ${theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-slate-700'}`}>
            <div className="flex items-center gap-3"><UserCircle className="w-4 h-4" /> 重新分配角色</div>
            <ChevronDown className="w-3 h-3 -rotate-90 opacity-50" />
          </ContextMenu.SubTrigger>
          <ContextMenu.Portal>
            <ContextMenu.SubContent className={`min-w-[160px] rounded-xl shadow-xl border backdrop-blur-xl overflow-hidden py-1.5 z-[99999] ${theme === 'light' ? 'bg-white/95 border-slate-200 text-slate-700' : 'bg-slate-800/95 border-slate-700 text-slate-200'}`} sideOffset={4} alignOffset={-4}>
              <ContextMenu.Item className="px-4 py-2 text-sm font-bold cursor-pointer hover:bg-slate-500 hover:text-white outline-none transition-colors" onClick={() => onUpdateElement(el.id, { type: 'narration', speaker: '' })}>旁白</ContextMenu.Item>
              <ContextMenu.Item className="px-4 py-2 text-sm font-bold cursor-pointer hover:bg-amber-500 hover:text-white outline-none transition-colors" onClick={() => onUpdateElement(el.id, { type: 'sound_effect', speaker: '' })}>音效</ContextMenu.Item>
              <ContextMenu.Separator className={`h-px my-1 ${theme === 'light' ? 'bg-slate-200' : 'bg-slate-700'}`} />
              {characters.filter(c => c.id !== 'nar').map(c => (
                 <ContextMenu.Item key={c.id} className="px-4 py-2 text-sm font-bold cursor-pointer hover:bg-sky-500 hover:text-white outline-none transition-colors" onClick={() => onUpdateElement(el.id, { type: 'dialogue', speaker: c.name })}>
                   {c.name}
                 </ContextMenu.Item>
              ))}
            </ContextMenu.SubContent>
          </ContextMenu.Portal>
        </ContextMenu.Sub>

        <ContextMenu.Separator className={`h-px my-1 ${theme === 'light' ? 'bg-slate-200' : 'bg-slate-700'}`} />

        {index > 0 && (
          <ContextMenu.Item className="px-4 py-2.5 text-sm font-bold flex items-center gap-3 cursor-pointer hover:bg-sky-500 hover:text-white outline-none transition-colors" onClick={() => onMergeUpElement && onMergeUpElement(el.id)}>
            <ArrowUpFromLine className="w-4 h-4" /> 与上一句合并
          </ContextMenu.Item>
        )}
        {index < totalElements - 1 && (
          <ContextMenu.Item className="px-4 py-2.5 text-sm font-bold flex items-center gap-3 cursor-pointer hover:bg-sky-500 hover:text-white outline-none transition-colors" onClick={() => onMergeDownElement && onMergeDownElement(el.id)}>
            <ArrowDownToLine className="w-4 h-4" /> 与下一句合并
          </ContextMenu.Item>
        )}
        
        <ContextMenu.Separator className={`h-px my-1 ${theme === 'light' ? 'bg-slate-200' : 'bg-slate-700'}`} />
        
        <ContextMenu.Item className="px-4 py-2.5 text-sm font-bold flex items-center gap-3 cursor-pointer hover:bg-red-500 hover:text-white text-red-500 outline-none transition-colors" onClick={() => onDeleteElement && onDeleteElement(el.id)}>
          <Trash2 className="w-4 h-4" /> 删除节点
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );

  if (viewMode === 'standard') {
    return (
      <ContextMenu.Root>
      <ContextMenu.Trigger>
      <motion.div 
        layout 
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        data-index={index}
        draggable={isDraggable && editingElementId !== el.id} 
        onDragStart={handleDragStart} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        onMouseEnter={() => syncScroll && onHover(index)}
        onMouseLeave={() => syncScroll && onHover(null)}
        className={`script-card mb-4 group relative overflow-hidden transition-all duration-300 rounded-3xl border 
          ${isDragOver ? 'border-sky-500 border-t-4 shadow-2xl' : ''}
          ${isCompliantIssue ? 'border-red-500 bg-red-500/5' : 
            pendingDiff ? 'border-amber-500/50 bg-amber-500/5 shadow-xl' :
            el.type === 'sound_effect' ? 
              (theme === 'light' ? 'bg-amber-50/80 border-amber-200' : theme === 'forest' ? 'bg-yellow-900/40 border-yellow-700/50' : 'bg-amber-900/30 border-amber-800/50') : 
              (theme === 'light' ? 'bg-white/80 border-slate-200 shadow-sm' : theme === 'forest' ? 'bg-emerald-950/40 border-emerald-800/30' : 'bg-[#0f0f13] border-slate-700/50')} 
          ${isActive ? 'ring-2 ring-sky-500/50 border-sky-400 scale-[1.01] shadow-xl opacity-100 active-card' : 
            syncScroll ? 'opacity-50 hover:opacity-100' : 'opacity-100'}`}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${roleColor.replace('bg-', 'bg-').replace('500', '400')} opacity-80`} />
        
        <div 
          onMouseEnter={() => setIsDraggable(true)} onMouseLeave={() => setIsDraggable(false)}
          className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-30 hover:!opacity-100 cursor-grab active:cursor-grabbing text-current z-10 transition-opacity p-1">
           <GripVertical className="w-5 h-5" />
        </div>

        <div className="p-6 lg:p-8 ml-4 relative z-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-mono opacity-30 font-black w-6 text-right shrink-0">#{index + 1}</span>
              
              <div className="flex items-center gap-3">
                {el.type !== 'sound_effect' && (
                  <div className="w-8 h-8 rounded-full shadow-inner border border-white/20 flex items-center justify-center text-xs font-black text-white shrink-0" style={{ background: avatarGradient }}>
                    {(el.speaker || "旁").charAt(0)}
                  </div>
                )}
                <div className="flex flex-col">
                  <div className="relative flex-shrink-0">
                    <select 
                        value={el.type === 'dialogue' && el.speaker ? el.speaker : el.type}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'narration') onUpdateElement(el.id, { type: 'narration', speaker: '' });
                          else if (val === 'sound_effect') onUpdateElement(el.id, { type: 'sound_effect', speaker: '' });
                          else onUpdateElement(el.id, { type: 'dialogue', speaker: val });
                        }}
                        className={`appearance-none outline-none border-none text-xs sm:text-sm font-black tracking-widest pl-3 pr-8 py-1 rounded-lg cursor-pointer 
                          ${el.type === 'narration' ? 'bg-slate-600/10 text-current hover:bg-slate-600/20' : 
                            el.type === 'sound_effect' ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20' : 
                            'bg-sky-500/10 text-sky-600 hover:bg-sky-500/20'}`}
                    >
                        <option value="narration" className="text-slate-900 bg-white">旁白</option>
                        <option value="sound_effect" className="text-slate-900 bg-white">音效</option>
                        <optgroup label="── 角色 ──" className="text-slate-400 bg-slate-50 pt-2 mt-1">
                          {characters.filter(c => c.id !== 'nar').map((char) => <option key={char.id} value={char.name} className="text-slate-900 bg-white">{char.name}</option>)}
                        </optgroup>
                    </select>
                    <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 opacity-60 text-current pointer-events-none" />
                  </div>
                  {el.type !== 'sound_effect' && (
                    editingElementId === el.id ? (
                      <input autoFocus value={el.meta} onChange={(e) => onUpdateElement(el.id, { meta: e.target.value })} 
                        className={`bg-black/10 border-none outline-none rounded px-2 py-1 font-mono text-[11px] font-black w-32 mt-1 ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'}`} placeholder="提示词" />
                    ) : (
                      <span className={`font-mono font-bold uppercase text-[10px] cursor-pointer mt-1 px-2 py-0.5 rounded transition-colors ${theme === 'light' ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-slate-400'}`} 
                        onClick={() => onEdit(el.id)}>({el.meta})</span>
                    )
                  )}
                </div>
              </div>

            </div>
            
            <div className={`flex items-center gap-2 transition-opacity ${isActive || showTuning || pendingDiff ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <button onClick={() => setShowTuning(!showTuning)} className={`p-2 rounded-xl transition-all ${showTuning ? 'bg-indigo-500 text-white' : theme === 'light' ? 'hover:bg-indigo-100 text-indigo-600' : 'hover:bg-indigo-500/20 text-indigo-400'}`} title="局部调音与破音字修改"><SlidersHorizontal className="w-4 h-4" /></button>
                <button onClick={() => onRewriteStart(el.id)} className={`p-2 rounded-xl transition-all ${theme === 'light' ? 'hover:bg-amber-100 text-amber-600' : 'hover:bg-amber-500/20 text-amber-400'}`} title="AI 局部重写"><Wand2 className="w-4 h-4" /></button>
                {el.type !== 'sound_effect' && (
                  <button onClick={() => onPlay(el.content, el.id, el.speaker, index)} className={`p-2 rounded-xl transition-all ${playingId === el.id ? 'bg-sky-500 text-white shadow-lg' : theme === 'light' ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-slate-300'}`} title="试听">
                    {playingId === el.id ? <Square className="w-4 h-4 fill-current animate-pulse" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                )}
                <button onClick={() => onEdit(editingElementId === el.id ? null : el.id)} className={`p-2 rounded-xl transition-all ${theme === 'light' ? 'hover:bg-slate-200' : 'hover:bg-white/10'}`} title="手动修改"><Pencil className={`w-4 h-4 ${editingElementId === el.id ? 'text-sky-500' : 'opacity-40'}`} /></button>
            </div>
          </div>

          <AnimatePresence>
            {showTuning && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-6">
                <div className={`p-5 rounded-2xl border ${theme === 'light' ? 'bg-indigo-50 border-indigo-100' : 'bg-indigo-900/10 border-indigo-500/20'}`}>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4 border-r border-indigo-500/10 pr-6">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Acoustic Tuning</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-4"><span className="text-xs font-bold w-12 opacity-60">语速</span><input type="range" min="0.5" max="2" step="0.1" value={el.audioConfig?.rate || 1} onChange={e => onUpdateElement(el.id, { audioConfig: { ...el.audioConfig, rate: parseFloat(e.target.value) } })} className="flex-1 accent-indigo-500" /><span className="text-xs font-mono font-bold w-8 text-right text-indigo-600">{el.audioConfig?.rate || 1}x</span></div>
                        <div className="flex items-center gap-4"><span className="text-xs font-bold w-12 opacity-60">音高</span><input type="range" min="0.5" max="2" step="0.1" value={el.audioConfig?.pitch || 1} onChange={e => onUpdateElement(el.id, { audioConfig: { ...el.audioConfig, pitch: parseFloat(e.target.value) } })} className="flex-1 accent-indigo-500" /><span className="text-xs font-mono font-bold w-8 text-right text-indigo-600">{el.audioConfig?.pitch || 1}x</span></div>
                        <div className="flex items-center gap-4"><span className="text-xs font-bold w-12 opacity-60">句后停顿</span><input type="range" min="0" max="3000" step="100" value={el.audioConfig?.pauseAfter || 400} onChange={e => onUpdateElement(el.id, { audioConfig: { ...el.audioConfig, pauseAfter: parseInt(e.target.value) } })} className="flex-1 accent-indigo-500" /><span className="text-xs font-mono font-bold w-8 text-right text-indigo-600">{el.audioConfig?.pauseAfter || 400}ms</span></div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Pronunciation / 局部读音替换</h4>
                      <div className="flex gap-2">
                        <input value={newWord} onChange={e => setNewWord(e.target.value)} placeholder="原词 (如:重阳)" className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-lg border outline-none ${theme === 'light' ? 'bg-white border-indigo-200' : 'bg-black/20 border-indigo-500/30'}`} />
                        <input value={newPinyin} onChange={e => setNewPinyin(e.target.value)} placeholder="替换为 (如:虫阳)" className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-lg border outline-none ${theme === 'light' ? 'bg-white border-indigo-200' : 'bg-black/20 border-indigo-500/30'}`} />
                        <button onClick={handleAddPronunciation} className="p-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"><Plus className="w-4 h-4" /></button>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {Object.entries(el.pronunciations || {}).map(([word, py]) => (
                          <div key={word} className={`flex items-center gap-2 px-2 py-1 rounded-md text-[11px] font-black border ${theme === 'light' ? 'bg-white border-indigo-200 text-indigo-700' : 'bg-black/40 border-indigo-500/30 text-indigo-300'}`}>
                            <span>{word} &rarr; {py}</span>
                            <button onClick={() => handleRemovePronunciation(word)} className="opacity-50 hover:opacity-100 text-red-500"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {isCompliantIssue && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-500">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-xs font-bold leading-relaxed">包含敏感词汇：<span className="font-black bg-red-500/20 px-1 rounded">{isCompliantIssue.join(", ")}</span>。请手动修改或使用 AI 重写！</div>
            </div>
          )}

          {/* AI 局部重写 Diff 对比面板 */}
          {pendingDiff ? (
            <div className="mb-4">
              <div className={`p-4 rounded-2xl border ${theme === 'light' ? 'bg-amber-50/50 border-amber-200' : 'bg-amber-950/20 border-amber-500/30'}`}>
                 <div className="flex items-center gap-2 mb-3">
                    <Wand2 className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-[11px] font-black text-amber-600 uppercase tracking-widest">AI Rewrite Preview</span>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className={`p-4 rounded-xl border ${theme === 'light' ? 'bg-red-50/50 border-red-100 text-red-800 line-through opacity-60' : 'bg-red-950/20 border-red-900/30 text-red-400 line-through opacity-60'} ${fontSizeClass[workspaceFontSize]} leading-relaxed font-bold`}>
                       {el.content || el.meta}
                    </div>
                    <div className={`p-4 rounded-xl border ${theme === 'light' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'} ${fontSizeClass[workspaceFontSize]} leading-relaxed font-black shadow-inner`}>
                       {pendingDiff.content || pendingDiff.meta}
                    </div>
                 </div>
                 <div className="flex justify-end gap-3 mt-4">
                    <button onClick={() => onRejectDiff(el.id)} className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${theme === 'light' ? 'text-slate-500 hover:bg-slate-200' : 'text-slate-400 hover:bg-white/10'}`}><XCircle className="w-4 h-4" /> 拒绝更改</button>
                    <button onClick={() => onAcceptDiff(el.id)} className={`px-4 py-2 text-xs font-black rounded-xl shadow-lg transition-all flex items-center gap-2 ${theme === 'light' ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-emerald-500 text-white hover:brightness-110'}`}><CheckCircle2 className="w-4 h-4" /> 接受并覆盖</button>
                 </div>
              </div>
            </div>
          ) : (
            editingElementId === el.id ? (
              <div className="relative">
                <textarea 
                  ref={textareaRef}
                  autoFocus 
                  value={el.content || (el.type === 'sound_effect' ? el.meta : "")} 
                  onKeyDown={handleTextareaKeyDown}
                  onChange={(e) => onUpdateElement(el.id, { content: e.target.value })} 
                  className={`w-full bg-transparent !border-none !outline-none !ring-0 !shadow-none p-0 ${fontSizeClass[workspaceFontSize]} leading-relaxed ${theme === 'light' ? 'text-slate-900' : 'text-white'} resize-none font-bold h-auto min-h-[60px] pl-[56px]`} 
                />
                <div className="absolute -bottom-6 right-0 text-[10px] text-sky-500 opacity-60 font-bold tracking-widest flex gap-4 pointer-events-none">
                   <span>[Ctrl+Enter] 拆分</span>
                   <span>[Backspace] 向上合并</span>
                </div>
              </div>
            ) : (
              <p onClick={() => onEdit(el.id)} className={`cursor-text break-words pl-[56px] ${el.type === 'dialogue' ? `${fontSizeClass[workspaceFontSize]} font-medium leading-relaxed ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'}` : el.type === 'sound_effect' ? `${fontSizeClass[workspaceFontSize]} italic font-medium leading-relaxed break-all ${theme === 'light' ? 'text-amber-700' : 'text-amber-400'}` : `${fontSizeClass[workspaceFontSize]} font-medium leading-relaxed opacity-80 ${theme === 'light' ? 'text-slate-800' : 'text-slate-300'}`}`}>
                {el.content || (el.type === 'sound_effect' ? el.meta : "")}
              </p>
            )
          )}

          <AnimatePresence>
            {inlineRewriteId === el.id && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`mt-4 ml-[56px] p-4 rounded-2xl border ${theme === 'light' ? 'bg-amber-50 border-amber-200' : 'bg-amber-900/20 border-amber-500/30'}`}>
                  <div className="flex items-center gap-3">
                    <Wand2 className="w-4 h-4 text-amber-500 shrink-0" />
                    <input autoFocus className={`flex-1 bg-transparent border-none outline-none text-sm font-bold placeholder:opacity-40 ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'}`} placeholder="输入修改要求（例如：改得更委婉一些）... 输完按 Enter 执行" value={inlineRewritePrompt} onChange={e => onRewritePromptChange(e.target.value)} onKeyDown={e => e.key === 'Enter' && onRewriteSubmit(el.id)} />
                    <button onClick={onRewriteCancel} className="p-1 rounded hover:bg-black/10 transition-all opacity-50"><X className="w-4 h-4" /></button>
                  </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
      </ContextMenu.Trigger>
      {MenuContent()}
      </ContextMenu.Root>
    );
  }

  if (viewMode === 'chat') {
    const isNarrator = el.type === 'narration' || el.type === 'sound_effect';
    const isRight = !isNarrator && index % 2 !== 0;
    return (
      <ContextMenu.Root>
      <ContextMenu.Trigger>
      <motion.div layout data-index={index} onMouseEnter={() => syncScroll && onHover(index)} onMouseLeave={() => syncScroll && onHover(null)} className={`script-card flex w-full my-4 px-4 sm:px-10 ${isNarrator ? 'justify-center' : isRight ? 'justify-end' : 'justify-start'} ${isActive ? 'active-card' : ''}`}>
        <div className={`w-auto max-w-[85%] flex flex-col ${isNarrator ? 'items-center text-center' : isRight ? 'items-end' : 'items-start'} ${isActive ? 'scale-[1.02]' : ''} transition-transform relative`}>
            {!isNarrator && (
              <div className={`flex items-center gap-2 mb-1 px-2 ${isRight ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className="w-6 h-6 rounded-full shadow-inner flex items-center justify-center text-[10px] font-black text-white" style={{ background: avatarGradient }}>{(el.speaker || "").charAt(0)}</div>
                <span className={`text-[10px] font-black opacity-60 uppercase`} style={{ color: roleColor.replace('bg-', 'var(--color-').replace('500', '500)') }}>{el.speaker}</span>
              </div>
            )}
            <div className={`p-4 sm:p-5 rounded-[2rem] shadow-sm relative group ${isCompliantIssue ? 'border-2 border-red-500 bg-red-500/10' : isNarrator ? (el.type === 'sound_effect' ? 'bg-amber-500/20 text-amber-600 rounded-xl px-6 py-2 border border-amber-500/30' : `bg-black/5 border border-black/5 ${theme==='light'?'text-slate-600':'text-slate-400'}`) : isRight ? 'bg-sky-500 text-white rounded-tr-sm' : `${theme==='light' ? 'bg-white text-slate-800' : 'bg-slate-800 text-white'} border ${theme==='light'?'border-slate-200':'border-slate-800'} rounded-tl-sm`}`}>
              {el.type !== 'sound_effect' && <div className={`text-[10px] font-mono font-black italic mb-2 ${isRight ? 'text-sky-200' : 'opacity-40'}`}>({el.meta})</div>}
              <div className={`${fontSizeClass[workspaceFontSize]} leading-relaxed font-medium break-words whitespace-pre-wrap`}>{el.content || el.meta}</div>
              <div className={`mt-3 flex gap-2 ${isRight ? 'justify-end' : 'justify-start'} opacity-0 group-hover:opacity-100 transition-opacity`}>
                  {el.type !== 'sound_effect' && <button onClick={() => onPlay(el.content, el.id, el.speaker, index)} className={`p-1.5 rounded-full ${theme === 'light' ? 'bg-white text-slate-700 shadow-sm' : 'bg-slate-700 text-white shadow-lg'} hover:text-sky-500`}><Volume2 className="w-3.5 h-3.5" /></button>}
                  <button onClick={() => onEdit(el.id)} className={`p-1.5 rounded-full ${theme === 'light' ? 'bg-white text-slate-700 shadow-sm' : 'bg-slate-700 text-white shadow-lg'} hover:text-sky-500`}><Pencil className="w-3.5 h-3.5" /></button>
              </div>
            </div>
        </div>
      </motion.div>
      </ContextMenu.Trigger>
      {MenuContent()}
      </ContextMenu.Root>
    );
  }

  if (viewMode === 'table') {
    return (
      <ContextMenu.Root>
      <ContextMenu.Trigger>
      <motion.div layout data-index={index} onMouseEnter={() => syncScroll && onHover(index)} onMouseLeave={() => syncScroll && onHover(null)} className={`script-card group relative grid grid-cols-12 gap-2 p-3 border-b ${theme === 'light' ? 'border-slate-200' : 'border-slate-800'} transition-colors ${isActive ? (theme === 'light' ? 'bg-sky-50 active-card' : 'bg-sky-900/30 active-card') : theme === 'light' ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50'}`}>
          <span className={`absolute left-0 top-0 bottom-0 w-1 ${roleColor} opacity-80`} />
          <div className="col-span-1 text-center text-xs font-mono opacity-40 py-2 flex items-center justify-center gap-1">{index + 1}</div>
          <div className="col-span-2 py-2 text-sm font-black truncate flex items-center gap-2">
            {el.type !== 'sound_effect' && <div className="w-5 h-5 rounded-full text-[8px] flex items-center justify-center text-white shrink-0" style={{ background: avatarGradient }}>{(el.speaker||"旁").charAt(0)}</div>}
            <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-widest ${el.type === 'narration' ? 'bg-slate-500/10 text-slate-500' : el.type === 'sound_effect' ? 'bg-amber-500/10 text-amber-500' : 'bg-sky-500/10 text-sky-500'}`}>{el.type === 'dialogue' ? el.speaker : el.type === 'narration' ? '旁白' : '音效'}</span>
          </div>
          <div className="col-span-3 py-2 text-xs font-mono opacity-60 truncate">({el.meta})</div>
          <div className={`col-span-5 py-2 text-sm truncate font-medium ${isCompliantIssue ? 'text-red-500 line-through' : ''}`}>{el.content || el.meta}</div>
          <div className="col-span-1 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            {el.type !== 'sound_effect' && <button onClick={() => onPlay(el.content, el.id, el.speaker, index)} className={`p-1.5 rounded hover:bg-sky-500 hover:text-white transition-colors`}><Play className="w-3 h-3 fill-current" /></button>}
            <button onClick={() => onEdit(el.id)} className="p-1.5 rounded hover:bg-sky-500 hover:text-white transition-colors"><Pencil className="w-3 h-3" /></button>
          </div>
      </motion.div>
      </ContextMenu.Trigger>
      {MenuContent()}
      </ContextMenu.Root>
    );
  }

  if (viewMode === 'teleprompter') {
    return (
      <div 
        data-index={index} 
        onClick={() => onHover(index)}
        className={`script-card flex flex-col justify-center items-center py-16 px-10 min-h-[50vh] transition-all duration-500 cursor-pointer 
          ${isActive ? 'opacity-100 scale-100 active-card drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'opacity-30 scale-95 hover:opacity-60'}`}
      >
        {el.type !== 'sound_effect' && (
          <div className="flex flex-col items-center mb-8">
            <span className={`px-6 py-2 rounded-full text-lg font-black uppercase tracking-widest shadow-lg ${el.type === 'narration' ? 'bg-slate-700 text-slate-100' : 'bg-sky-600 text-white'}`}>{el.type === 'dialogue' ? el.speaker : '旁白'}</span>
            <span className="mt-6 text-2xl font-mono italic text-slate-400">({el.meta})</span>
          </div>
        )}
        <div className={`text-center ${teleprompterFontClass[workspaceFontSize]} leading-relaxed font-black break-words whitespace-pre-wrap ${el.type === 'sound_effect' ? 'text-amber-500 italic' : isActive ? 'text-white' : 'text-slate-400'}`}>{el.content || el.meta}</div>
      </div>
    );
  }

  return null;
};

export default memo(ScriptCard, (prev, next) => {
  return (
    prev.element === next.element && prev.isActive === next.isActive &&
    prev.isCompliantIssue === next.isCompliantIssue && prev.theme === next.theme &&
    prev.workspaceFontSize === next.workspaceFontSize && prev.playingId === next.playingId &&
    prev.editingElementId === next.editingElementId && prev.inlineRewriteId === next.inlineRewriteId &&
    prev.inlineRewritePrompt === next.inlineRewritePrompt && prev.pendingDiff === next.pendingDiff &&
    prev.syncScroll === next.syncScroll && prev.viewMode === next.viewMode && prev.totalElements === next.totalElements
  );
});
