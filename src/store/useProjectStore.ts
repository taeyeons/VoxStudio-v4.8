import { create } from 'zustand';
import { temporal } from 'zundo';
import { Project, Chapter, ScriptElement, Character, ProductionStyle, Theme, FontSize, ViewMode } from '../types';

interface ProjectState {
  projectId: string;
  projectName: string;
  chapters: Chapter[];
  currentChapterId: string | null;
  characters: Character[];
  prodStyle: ProductionStyle;
  readingSpeed: number;
  theme: Theme;
  workspaceFontSize: FontSize;
  viewMode: ViewMode;
  zenMode: boolean;
  globalPronunciations: Record<string, string>;

  setProjectId: (id: string) => void;
  setProjectName: (name: string) => void;
  setChapters: (updater: Chapter[] | ((prev: Chapter[]) => Chapter[])) => void;
  setCurrentChapterId: (id: string | null) => void;
  setCharacters: (updater: Character[] | ((prev: Character[]) => Character[])) => void;
  setProdStyle: (style: ProductionStyle) => void;
  setReadingSpeed: (speed: number) => void;
  setTheme: (theme: Theme) => void;
  setWorkspaceFontSize: (fontSize: FontSize) => void;
  setViewMode: (mode: ViewMode) => void;
  setZenMode: (flag: boolean) => void;
  setGlobalPronunciations: (pron: Record<string, string>) => void;
  updateCurrentChapter: (partial: Partial<Chapter>) => void;
  updateScriptElement: (id: string, partial: Partial<ScriptElement>) => void;
  reorderScriptElements: (startIndex: number, endIndex: number) => void;
  deleteScriptElement: (id: string) => void;
  batchReplaceContent: (find: string, replace: string) => void;
}

export const useProjectStore = create<ProjectState>()(
  temporal(
    (set) => ({
      projectId: crypto.randomUUID(),
      projectName: '未命名项目',
      chapters: [{ id: "ch-1", title: "点击输入原文", novelText: "", scriptText: "", parsedElements: [] }],
      currentChapterId: "ch-1",
      characters: [{ id: "nar", name: "旁白", age: "成熟", gender: "中性", tone: "磁性睿智", description: "环境烘托与情节转场", voiceId: "zh-CN-XiaoxiaoNeural", color: "bg-slate-500", avatarGradient: "linear-gradient(135deg, #64748b, #334155)" }],
      prodStyle: '热血玄幻',
      readingSpeed: 1,
      theme: 'light',
      workspaceFontSize: 'base',
      viewMode: 'standard',
      zenMode: false,
      globalPronunciations: {},

      setProjectId: (id) => set({ projectId: id }),
      setProjectName: (name) => set({ projectName: name }),
      setChapters: (updater) => set((state) => ({ 
        chapters: typeof updater === 'function' ? updater(state.chapters) : updater 
      })),
      setCurrentChapterId: (id) => set({ currentChapterId: id }),
      setCharacters: (updater) => set((state) => ({ 
        characters: typeof updater === 'function' ? updater(state.characters) : updater 
      })),
      setProdStyle: (style) => set({ prodStyle: style }),
      setReadingSpeed: (speed) => set({ readingSpeed: speed }),
      setTheme: (theme) => set({ theme }),
      setWorkspaceFontSize: (fontSize) => set({ workspaceFontSize: fontSize }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setZenMode: (flag) => set({ zenMode: flag }),
      setGlobalPronunciations: (pron) => set({ globalPronunciations: pron }),

      updateCurrentChapter: (partial) => set((state) => ({
        chapters: state.chapters.map(c => 
          c.id === state.currentChapterId ? { ...c, ...partial } : c
        )
      })),

      updateScriptElement: (id, partial) => set((state) => ({
        chapters: state.chapters.map(c => 
          c.id === state.currentChapterId 
            ? { ...c, parsedElements: c.parsedElements.map(e => e.id === id ? { ...e, ...partial } : e) }
            : c
        )
      })),

      reorderScriptElements: (startIndex, endIndex) => set((state) => {
        const chapter = state.chapters.find(c => c.id === state.currentChapterId);
        if (!chapter) return state;
        
        const newElements = Array.from(chapter.parsedElements);
        const [removed] = newElements.splice(startIndex, 1);
        newElements.splice(endIndex, 0, removed);
        
        return {
          chapters: state.chapters.map(c => 
            c.id === state.currentChapterId ? { ...c, parsedElements: newElements } : c
          )
        };
      }),

      deleteScriptElement: (id) => set((state) => ({
        chapters: state.chapters.map(c => 
          c.id === state.currentChapterId
            ? { ...c, parsedElements: c.parsedElements.filter(e => e.id !== id) }
            : c
        )
      })),

      batchReplaceContent: (find, replace) => set((state) => ({
        chapters: state.chapters.map(c => 
          c.id === state.currentChapterId
            ? {
                ...c,
                parsedElements: c.parsedElements.map(e => ({
                  ...e,
                  content: e.content.replaceAll(find, replace),
                  speaker: e.speaker ? e.speaker.replaceAll(find, replace) : undefined
                }))
              }
            : c
        )
      }))
    })
  )
);
