import { useEffect, useRef, useState } from 'react';

/**
 * Değeri geciktirir.
 *
 * NEDEN: Canlı önizleme her tuş vuruşunda sunucuya istek atarsa (a) sunucu
 * gereksiz yüklenir, (b) 368 KB'lık bir XSLT'de XSLTProcessor dönüşümü her
 * karakterde çalışır ve editör yazılamaz hâle gelir. Kullanıcı yazmayı
 * bıraktıktan sonra bir kez çalıştırmak yeterlidir.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export interface DeferredTask {
  /** Yeni bir çalıştırma ister; önceki bekleyen iptal edilir. */
  schedule: (fn: () => void | Promise<void>) => void;
  /** Bekleyeni hemen (gecikmesiz) çalıştırır. */
  flush: () => void;
  /** Bekleyeni iptal eder. */
  cancel: () => void;
  /** Şu an bekleyen bir çalıştırma var mı. */
  isPending: () => boolean;
}

/**
 * Geciktirilmiş (debounce) görev zamanlayıcısı.
 *
 * `useDebouncedValue`'dan farkı: bir DEĞERİ değil, bir İŞLEVİ geciktirir ve
 * işlev her zaman en güncel hâliyle çalışır — bu yüzden `useEffect` bağımlılık
 * listesine devasa XSLT metnini koymak gerekmez.
 */
export function useDebouncedTask(delayMs: number): DeferredTask {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef<(() => void | Promise<void>) | null>(null);

  const clear = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => clear, []);

  return {
    schedule: (fn) => {
      fnRef.current = fn;
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        const f = fnRef.current;
        fnRef.current = null;
        if (f) void f();
      }, delayMs);
    },
    flush: () => {
      clear();
      const f = fnRef.current;
      fnRef.current = null;
      if (f) void f();
    },
    cancel: () => {
      clear();
      fnRef.current = null;
    },
    isPending: () => timer.current !== null,
  };
}
