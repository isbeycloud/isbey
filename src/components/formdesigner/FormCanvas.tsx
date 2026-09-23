import React, { useRef, useState, useCallback } from 'react';
import {
  type FormSection,
  type FormElement,
  type FormDesign,
  type ToolboxItem,
  SECTION_TYPE_LABELS,
  PAPER_SIZES,
} from './formDesignerTypes';
import { FormElementRenderer } from './FormElement';

interface FormCanvasProps {
  design: FormDesign;
  sections: FormSection[];
  selectedElementId: string | null;
  selectedSectionId: string | null;
  previewData?: Record<string, any>;
  isPreviewMode: boolean;
  onSelectElement: (elementId: string | null, sectionId: string | null) => void;
  onSelectSection: (sectionId: string | null) => void;
  onElementMove: (sectionId: string, elementId: string, dx: number, dy: number) => void;
  onElementResize: (sectionId: string, elementId: string, newWidth: number, newHeight: number, newX: number, newY: number) => void;
  onDropElement: (sectionId: string, item: ToolboxItem, x: number, y: number) => void;
  onDeleteElement: (sectionId: string, elementId: string) => void;
  onSectionHeightChange: (sectionId: string, height: number) => void;
}

// Grid snap helper
const GRID = 4;
const snap = (v: number) => Math.round(v / GRID) * GRID;

export const FormCanvas: React.FC<FormCanvasProps> = ({
  design,
  sections,
  selectedElementId,
  selectedSectionId,
  previewData,
  isPreviewMode,
  onSelectElement,
  onSelectSection,
  onElementMove,
  onElementResize,
  onDropElement,
  onDeleteElement,
  onSectionHeightChange,
}) => {
  const paperWidth = PAPER_SIZES[design.paperSize]?.width || 760;

  const dragState = useRef<{
    type: 'move' | 'resize';
    sectionId: string;
    elementId: string;
    startX: number;
    startY: number;
    startElX: number;
    startElY: number;
    startElW: number;
    startElH: number;
    handle?: string;
  } | null>(null);

  const [dropTargetSection, setDropTargetSection] = useState<string | null>(null);

  // ─── Key Handler (Delete) ────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId && selectedSectionId) {
      onDeleteElement(selectedSectionId, selectedElementId);
    }
  }, [selectedElementId, selectedSectionId, onDeleteElement]);

  // ─── Mouse Down on Element ───────────────────────────────────────────────
  const handleElementMouseDown = (
    e: React.MouseEvent,
    sectionId: string,
    element: FormElement,
  ) => {
    e.stopPropagation();
    if (isPreviewMode || element.locked) return;

    // Check if clicking resize handle
    const target = e.target as HTMLElement;
    const handle = target.getAttribute('data-handle');

    onSelectElement(element.id, sectionId);

    dragState.current = {
      type: handle ? 'resize' : 'move',
      sectionId,
      elementId: element.id,
      startX: e.clientX,
      startY: e.clientY,
      startElX: element.x,
      startElY: element.y,
      startElW: element.width,
      startElH: element.height,
      handle: handle || undefined,
    };
  };

  // ─── Mouse Move ──────────────────────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent) => {
    const ds = dragState.current;
    if (!ds) return;

    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;

    if (ds.type === 'move') {
      const newX = snap(Math.max(0, ds.startElX + dx));
      const newY = snap(Math.max(0, ds.startElY + dy));
      onElementMove(ds.sectionId, ds.elementId, newX - ds.startElX, newY - ds.startElY);
      ds.startElX = newX;
      ds.startElY = newY;
      ds.startX = e.clientX;
      ds.startY = e.clientY;
    } else if (ds.type === 'resize' && ds.handle) {
      let newX = ds.startElX;
      let newY = ds.startElY;
      let newW = ds.startElW;
      let newH = ds.startElH;

      if (ds.handle.includes('e')) newW = snap(Math.max(20, ds.startElW + dx));
      if (ds.handle.includes('w')) { newW = snap(Math.max(20, ds.startElW - dx)); newX = snap(ds.startElX + dx); }
      if (ds.handle.includes('s')) newH = snap(Math.max(10, ds.startElH + dy));
      if (ds.handle.includes('n')) { newH = snap(Math.max(10, ds.startElH - dy)); newY = snap(ds.startElY + dy); }

      onElementResize(ds.sectionId, ds.elementId, newW, newH, newX, newY);
    }
  };

  const handleMouseUp = () => {
    dragState.current = null;
  };

  // ─── Drop from Toolbox ───────────────────────────────────────────────────
  const handleDrop = (e: React.DragEvent, sectionId: string, sectionEl: HTMLDivElement | null) => {
    e.preventDefault();
    setDropTargetSection(null);
    const raw = e.dataTransfer.getData('application/form-element');
    if (!raw) return;
    try {
      const item: ToolboxItem = JSON.parse(raw);
      const rect = sectionEl?.getBoundingClientRect();
      if (!rect) return;
      const x = snap(e.clientX - rect.left);
      const y = snap(e.clientY - rect.top);
      onDropElement(sectionId, item, Math.max(0, x), Math.max(0, y));
    } catch (err) {
      console.error('Drop error:', err);
    }
  };

  const handleDragOver = (e: React.DragEvent, sectionId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropTargetSection(sectionId);
  };

  const handleDragLeave = () => {
    setDropTargetSection(null);
  };

  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div
      className="fd-canvas-body"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={() => { onSelectElement(null, null); onSelectSection(null); }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ outline: 'none' }}
    >
      {/* Paper */}
      <div
        className="fd-canvas fd-canvas-grid"
        style={{ width: paperWidth }}
        onClick={e => e.stopPropagation()}
      >
        {sortedSections.map(section => (
          section.visible || !isPreviewMode ? (
            <SectionRenderer
              key={section.id}
              section={section}
              paperWidth={paperWidth}
              isSelected={selectedSectionId === section.id && !selectedElementId}
              isPreviewMode={isPreviewMode}
              dropTarget={dropTargetSection === section.id}
              previewData={previewData}
              selectedElementId={selectedElementId}
              onSelectSection={() => {
                onSelectSection(section.id);
                onSelectElement(null, section.id);
              }}
              onElementMouseDown={handleElementMouseDown}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onSectionHeightChange={onSectionHeightChange}
            />
          ) : null
        ))}
      </div>
    </div>
  );
};

// ─── Section Renderer ─────────────────────────────────────────────────────

interface SectionRendererProps {
  section: FormSection;
  paperWidth: number;
  isSelected: boolean;
  isPreviewMode: boolean;
  dropTarget: boolean;
  previewData?: Record<string, any>;
  selectedElementId: string | null;
  onSelectSection: () => void;
  onElementMouseDown: (e: React.MouseEvent, sectionId: string, element: FormElement) => void;
  onDrop: (e: React.DragEvent, sectionId: string, el: HTMLDivElement | null) => void;
  onDragOver: (e: React.DragEvent, sectionId: string) => void;
  onDragLeave: () => void;
  onSectionHeightChange: (sectionId: string, height: number) => void;
}

const SectionRenderer: React.FC<SectionRendererProps> = ({
  section,
  paperWidth,
  isSelected,
  isPreviewMode,
  dropTarget,
  previewData,
  selectedElementId,
  onSelectSection,
  onElementMouseDown,
  onDrop,
  onDragOver,
  onDragLeave,
  onSectionHeightChange,
}) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const resizeDragRef = useRef<{ startY: number; startH: number } | null>(null);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    resizeDragRef.current = { startY: e.clientY, startH: section.height };
    const onMove = (me: MouseEvent) => {
      if (!resizeDragRef.current) return;
      const dy = me.clientY - resizeDragRef.current.startY;
      const newH = Math.max(30, resizeDragRef.current.startH + dy);
      onSectionHeightChange(section.id, newH);
    };
    const onUp = () => {
      resizeDragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={sectionRef}
      className={`fd-section ${isSelected ? 'selected' : ''} ${dropTarget ? 'fd-drop-zone-active' : ''}`}
      style={{
        width: paperWidth,
        height: section.height,
        position: 'relative',
        backgroundColor: section.backgroundColor || 'transparent',
        borderBottom: !isPreviewMode ? '1px dashed #d1d5db' : 'none',
      }}
      onClick={e => { e.stopPropagation(); onSelectSection(); }}
      onDrop={e => onDrop(e, section.id, sectionRef.current)}
      onDragOver={e => onDragOver(e, section.id)}
      onDragLeave={onDragLeave}
    >
      {/* Section label badge */}
      {!isPreviewMode && (
        <div className="fd-section-label">
          {SECTION_TYPE_LABELS[section.type]} ({section.height}px)
        </div>
      )}

      {/* Elements */}
      {section.elements.map(element => (
        <FormElementRenderer
          key={element.id}
          element={element}
          isSelected={selectedElementId === element.id}
          isDesignMode={!isPreviewMode}
          previewData={previewData}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => onElementMouseDown(e, section.id, element)}
        />
      ))}

      {/* Section resize handle */}
      {!isPreviewMode && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            cursor: 'row-resize',
            background: isSelected ? 'rgba(26,86,219,0.15)' : 'transparent',
            zIndex: 20,
          }}
          onMouseDown={handleResizeMouseDown}
          title="Bölüm yüksekliğini değiştir"
        >
          {isSelected && (
            <div style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              transform: 'translateX(-50%)',
              width: 40, height: 4,
              background: '#1a56db',
              borderRadius: 2,
            }} />
          )}
        </div>
      )}

      {/* Drop zone overlay */}
      {dropTarget && !isPreviewMode && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(26,86,219,0.06)',
          border: '2px dashed rgba(26,86,219,0.4)',
          pointerEvents: 'none',
          zIndex: 30,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#1a56db', fontSize: 12, fontWeight: 600,
        }}>
          Elemanı buraya bırakın
        </div>
      )}
    </div>
  );
};
