import { useCallback, useRef, useState } from 'react';

/**
 * XSLT Geri Al / İleri Al geçmişi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-27: Editör için yazıldı.
 *
 * NEDEN KENDİ HOOK'U: Monaco'nun kendi undo yığını yalnızca editör
 * örneği yaşadığı sürece geçerlidir ve model değiştirildiğinde (sekmeler
 * arası geçiş, tam ekran) sıfırlanır. Kullanıcı "Geri Al" düğmesine
 * bastığında Monaco'nun iç yığınına güvenmek, düğmenin bazen çalışmaması
 * demektir. Bu hook düğme ve Ctrl+Z'nin AYNI kaynağı kullanmasını sağlar.
 *
 * BELLEK: Şablonlar 368 KB'a kadar çıkabilir. Her tuş vuruşunda tam kopya
 * tutmak saniyeler içinde yüzlerce MB eder. Bu yüzden:
 *   • değişiklikler COALESCE edilir (aynı "yazma patlaması" tek adım sayılır),
 *   • geçmiş hem ADIM hem TOPLAM BAYT ile sınırlanır,
 *   • sınır aşılırsa EN ESKİ adımlar atılır (yeni iş kaybedilmez).
 *
 * KURAL: Bu hook metni ASLA kendiliğinden değiştirmez; yalnız kaydeder.
 */
export interface HistoryEntry {
  /** Adımın içeriği. */
  text: string;
  /** Adımın oluşma nedeni (düğmede tooltip olarak gösterilir). */
  label: string;
  /** Adımın alındığı zaman. */
  at: number;
}

export interface XsltHistoryApi {
  /** Yeni bir içerik kaydeder (kullanıcı düzenlemesi). */
  push: (text: string, label?: string) => void;
  /** Kaydetmeden önce bekleyen değişikliği hemen kaydeder. */
  flush: (text: string, label?: string) => void;
  /** Geri alınabilir mi. */
  canUndo: boolean;
  /** İleri alınabilir mi. */
  canRedo: boolean;
  /** Bir adım geri gider; yeni içeriği döndürür (yoksa null). */
  undo: () => string | null;
  /** Bir adım ileri gider; yeni içeriği döndürür (yoksa null). */
  redo: () => string | null;
  /** Geçmişi sıfırlar (yeni şablon yüklendiğinde). */
  reset: (text: string, label?: string) => void;
  /** Kaç adım geri gidilebilir / ileri gidilebilir. */
  counts: { undo: number; redo: number };
}

const MAX_STEPS = 100;
/** Toplam geçmiş bütçesi (bayt). 3 adım × ~400 KB ≈ 1,2 MB üst sınır. */
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
/** Bu süre içindeki ardışık değişiklikler tek adımda birleştirilir. */
const COALESCE_MS = 600;

export function useXsltHistory(initial: string, initialLabel = 'Başlangıç'): XsltHistoryApi {
  const past = useRef<HistoryEntry[]>([{ text: initial, label: initialLabel, at: Date.now() }]);
  const future = useRef<HistoryEntry[]>([]);
  const lastPushAt = useRef<number>(0);
  // Görünümü tazelemek için sayaç; asıl veri ref'te tutulur (kopya maliyeti yok).
  const [, bump] = useState(0);
  const notify = useCallback(() => bump(n => n + 1), []);

  const trim = useCallback(() => {
    let total = 0;
    for (const e of past.current) total += e.text.length;
    while (past.current.length > MAX_STEPS || (total > MAX_TOTAL_BYTES && past.current.length > 2)) {
      const removed = past.current.shift();
      if (!removed) break;
      total -= removed.text.length;
    }
  }, []);

  const push = useCallback((text: string, label = 'Düzenleme') => {
    const top = past.current[past.current.length - 1];
    if (top && top.text === text) return; // değişiklik yok
    const now = Date.now();

    // Yazma patlaması: üstteki adım ZATEN bir düzenleme ve çok yeniyse
    // yeni adım açmak yerine onu güncelle. Böylece Ctrl+Z karakter karakter
    // değil, anlamlı parçalar hâlinde geri gider.
    const canCoalesce =
      top &&
      top.label !== initialLabel &&
      top.label !== 'Yükleme' &&
      now - lastPushAt.current < COALESCE_MS &&
      past.current.length > 1;

    if (canCoalesce) {
      top.text = text;
      top.at = now;
    } else {
      past.current.push({ text, label, at: now });
    }
    lastPushAt.current = now;
    future.current = []; // yeni düzenleme ileri yığınını geçersiz kılar
    trim();
    notify();
  }, [initialLabel, notify, trim]);

  const flush = useCallback((text: string, label = 'Düzenleme') => {
    future.current = [];
    push(text, label);
  }, [push]);

  const undo = useCallback((): string | null => {
    if (past.current.length <= 1) return null;
    const cur = past.current.pop()!;
    future.current.push(cur);
    notify();
    return past.current[past.current.length - 1].text;
  }, [notify]);

  const redo = useCallback((): string | null => {
    const next = future.current.pop();
    if (!next) return null;
    past.current.push(next);
    notify();
    return next.text;
  }, [notify]);

  const reset = useCallback((text: string, label = 'Başlangıç') => {
    past.current = [{ text, label, at: Date.now() }];
    future.current = [];
    lastPushAt.current = 0;
    notify();
  }, [notify]);

  return {
    push,
    flush,
    canUndo: past.current.length > 1,
    canRedo: future.current.length > 0,
    undo,
    redo,
    reset,
    counts: { undo: past.current.length - 1, redo: future.current.length },
  };
}
