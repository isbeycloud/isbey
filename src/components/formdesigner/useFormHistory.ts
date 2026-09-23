import { useState, useCallback, useRef } from 'react';
import type { FormSection, HistoryEntry } from './formDesignerTypes';

const MAX_HISTORY = 50;

export function useFormHistory(initialSections: FormSection[]) {
  const [history, setHistory] = useState<HistoryEntry[]>([
    { sections: JSON.parse(JSON.stringify(initialSections)), description: 'Başlangıç', timestamp: Date.now() },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoRef = useRef(false);

  const push = useCallback((sections: FormSection[], description: string) => {
    if (isUndoRedoRef.current) return;
    setHistory(prev => {
      const trimmed = prev.slice(0, historyIndex + 1);
      const newEntry: HistoryEntry = {
        sections: JSON.parse(JSON.stringify(sections)),
        description,
        timestamp: Date.now(),
      };
      const newHistory = [...trimmed, newEntry];
      if (newHistory.length > MAX_HISTORY) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [historyIndex]);

  const undo = useCallback((): FormSection[] | null => {
    if (historyIndex <= 0) return null;
    const newIndex = historyIndex - 1;
    isUndoRedoRef.current = true;
    setHistoryIndex(newIndex);
    setTimeout(() => { isUndoRedoRef.current = false; }, 50);
    return JSON.parse(JSON.stringify(history[newIndex].sections));
  }, [history, historyIndex]);

  const redo = useCallback((): FormSection[] | null => {
    if (historyIndex >= history.length - 1) return null;
    const newIndex = historyIndex + 1;
    isUndoRedoRef.current = true;
    setHistoryIndex(newIndex);
    setTimeout(() => { isUndoRedoRef.current = false; }, 50);
    return JSON.parse(JSON.stringify(history[newIndex].sections));
  }, [history, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const reset = useCallback((sections: FormSection[]) => {
    setHistory([{ sections: JSON.parse(JSON.stringify(sections)), description: 'Sıfırla', timestamp: Date.now() }]);
    setHistoryIndex(0);
  }, []);

  return { push, undo, redo, canUndo, canRedo, reset, historyLength: history.length, historyIndex };
}
