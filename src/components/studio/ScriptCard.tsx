import React from 'react';
import { ScriptElement, Character, Theme, FontSize } from '../../types';

interface ScriptCardProps {
  element: ScriptElement;
  index: number;
  totalElements: number;
  isActive: boolean;
  isCompliantIssue: string[] | null;
  characters: Character[];
  theme: Theme;
  workspaceFontSize: FontSize;
  emotionGlowColor?: string;
  syncScroll: boolean;
  playingId: string | null;
  editingElementId: string | null;
  inlineRewriteId: string | null;
  inlineRewritePrompt: string;
  viewMode: string;
  pendingDiff: any;
  onAcceptDiff: (id: string, newElement: ScriptElement) => void;
  onRejectDiff: (id: string) => void;
  onHover: (idx: number | null) => void;
  onPlay: (text: string, voiceId?: string, elementId?: string, index?: number) => void;
  onEdit: (id: string | null) => void;
  onRewriteStart: (id: string) => void;
  onRewriteCancel: () => void;
  onRewriteSubmit: (id: string, prompt: string) => void;
  onRewritePromptChange: (prompt: string) => void;
  onUpdateElement: (id: string, element: Partial<ScriptElement>) => void;
  onSplitElement: (id: string, text1: string, text2: string) => void;
  onMergeUpElement: (index: number) => void;
  onMergeDownElement: (index: number) => void;
  onReorder: (startIndex: number, endIndex: number) => void;
  onDeleteElement: (id: string) => void;
}

const ScriptCard: React.FC<ScriptCardProps> = ({
  element, isActive, emotionGlowColor, onHover, index, onPlay, characters, theme
}) => {
  return (
    <div 
      className={`script-card p-4 my-2 rounded-lg border flex flex-col gap-2 transition-all ${isActive ? 'ring-2 ring-blue-500 active-card' : 'border-gray-200'} ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-200'}`}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      style={{ boxShadow: isActive && emotionGlowColor ? `0 0 15px ${emotionGlowColor}` : 'none' }}
    >
      <div className="flex justify-between items-center text-xs text-gray-500">
        <span className="font-bold">{element.type === 'dialogue' ? `【${element.speaker}】` : element.type === 'narration' ? '【旁白】' : '【音效】'}</span>
        <button onClick={() => onPlay(element.content, characters.find(c => c.name === element.speaker)?.voiceId, element.id, index)} className="p-1 hover:text-blue-500">
          ▶ 播放
        </button>
      </div>
      <p className="text-sm">{element.content}</p>
      {element.meta && <p className="text-xs text-gray-400 italic">[{element.meta}]</p>}
    </div>
  );
};

export default ScriptCard;
