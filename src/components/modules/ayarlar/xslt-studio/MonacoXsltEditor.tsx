import React, { useEffect, useRef, useState } from 'react';

/**
 * Monaco XSLT Editörü (tembel yüklenen sarmalayıcı)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-27: Düz `<textarea>` yerine gerçek bir kod editörü.
 *
 * TEMBEL YÜKLEME NEDENİ: Monaco derlenmiş hâlde ~3-4 MB'tır ve çekirdek
 * paketin içine girerse uygulamanın ilk açılışını (giriş ekranı, dashboard)
 * yavaşlatır. Bu bileşen `import()` ile ayrı bir yığın hâlinde yüklenir,
 * yani Monaco YALNIZCA bu ekran açıldığında indirilir.
 *
 * İZOLASYON: `vite.config.ts`'te Monaco ayrı bir chunk'a zorlanır (bkz.
 * manualChunks). Böylece ana bundle büyümez.
 *
 * XSLT DİLİ: Monaco'da yerleşik XSLT grameri yoktur. XML grameri kullanılır
 * ve üstüne XSLT'ye özgü bir katman eklenir: `xsl:` öneki tanınıyor, XSLT
 * eleman/niteliği için tamamlama ve `select=` içinde XPath ipuçları verilir.
 * Bu bir dil sunucusu değildir — hata ayıklama sunucu doğrulayıcıdan gelir
 * (bkz. markers prop'u).
 */

export interface MonacoMarker {
  /** 1 tabanlı satır. */
  line: number;
  /** 1 tabanlı kolon. */
  column: number;
  message: string;
  severity: 'error' | 'warning';
  /** Kullanıcı tıkladığında gidilecek ek bağlam (opsiyonel). */
  detail?: string;
}

export interface MonacoXsltEditorProps {
  value: string;
  onChange: (next: string) => void;
  /** Dışarıdan dayatılan konumlar (doğrulayıcı çıktısı). */
  markers?: MonacoMarker[];
  readOnly?: boolean;
  /** Tam ekran modunda yükseklik farklı verilir. */
  height?: string;
  onReady?: (api: MonacoXsltEditorHandle) => void;
  onCursorChange?: (pos: { line: number; column: number }) => void;
  /** Kullanıcı düzenlemeyi bitirdiğinde (geri al adımı) çağrılır. */
  onEditCommitted?: (text: string) => void;
}

export interface MonacoXsltEditorHandle {
  /** İmleci verilen konuma taşır ve satırı vurgular. */
  revealMarker: (marker: MonacoMarker) => void;
  format: () => void;
  focus: () => void;
  /** Editörün sahip olduğu değeri döndürür (kaydetmeden önce doğrulama için). */
  getValue: () => string;
  /** Monaco'nun kendi geri alma yığınını kullanır (Ctrl+Z). */
  trigger: (actionId: string) => void;
}

/** XSLT bilgi kartları (ipucu/completion için). */
const XSLT_ELEMENTS: Array<{ label: string; detail: string; insertText: string }> = [
  { label: 'xsl:template', detail: 'Şablon kuralı', insertText: '<xsl:template match="/">\n  $0\n</xsl:template>' },
  { label: 'xsl:apply-templates', detail: 'Alt düğümlere şablon uygula', insertText: '<xsl:apply-templates select="$0"/>' },
  { label: 'xsl:value-of', detail: 'Düğüm değerini yaz', insertText: '<xsl:value-of select="$0"/>' },
  { label: 'xsl:for-each', detail: 'Döngü', insertText: '<xsl:for-each select="$0">\n  \n</xsl:for-each>' },
  { label: 'xsl:if', detail: 'Koşul', insertText: '<xsl:if test="$0">\n  \n</xsl:if>' },
  { label: 'xsl:choose', detail: 'Çoklu koşul', insertText: '<xsl:choose>\n  <xsl:when test="$0">\n  </xsl:when>\n  <xsl:otherwise>\n  </xsl:otherwise>\n</xsl:choose>' },
  { label: 'xsl:when', detail: 'Koşul dalı', insertText: '<xsl:when test="$0">\n</xsl:when>' },
  { label: 'xsl:otherwise', detail: 'Varsayılan dal', insertText: '<xsl:otherwise>\n</xsl:otherwise>' },
  { label: 'xsl:variable', detail: 'Değişken', insertText: '<xsl:variable name="$1" select="$0"/>' },
  { label: 'xsl:param', detail: 'Parametre', insertText: '<xsl:param name="$0"/>' },
  { label: 'xsl:call-template', detail: 'Şablon çağır', insertText: '<xsl:call-template name="$0"/>' },
  { label: 'xsl:with-param', detail: 'Şablona parametre geçir', insertText: '<xsl:with-param name="$1" select="$0"/>' },
  { label: 'xsl:sort', detail: 'Sıralama', insertText: '<xsl:sort select="$0"/>' },
  { label: 'xsl:output', detail: 'Çıktı yönergesi', insertText: '<xsl:output method="html" encoding="UTF-8" indent="yes"/>' },
  { label: 'xsl:stylesheet', detail: 'Kök eleman', insertText: '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">\n$0\n</xsl:stylesheet>' },
  { label: 'xsl:text', detail: 'Sabit metin (boşluk korunur)', insertText: '<xsl:text>$0</xsl:text>' },
  { label: 'xsl:attribute', detail: 'Nitelik üret', insertText: '<xsl:attribute name="$1">$0</xsl:attribute>' },
  { label: 'xsl:element', detail: 'Eleman üret', insertText: '<xsl:element name="$0">\n</xsl:element>' },
  { label: 'xsl:number', detail: 'Sıra numarası', insertText: '<xsl:number value="$0" format="1"/>' },
  { label: 'xsl:key', detail: 'Anahtar tanımı', insertText: '<xsl:key name="$1" match="$2" use="$0"/>' },
  { label: 'xsl:decimal-format', detail: 'Ondalık biçim', insertText: '<xsl:decimal-format name="$0" decimal-separator="," grouping-separator="."/>' },
  { label: 'xsl:message', detail: 'Hata ayıklama mesajı', insertText: '<xsl:message>$0</xsl:message>' },
  { label: 'xsl:comment', detail: 'Yorum üret', insertText: '<xsl:comment>$0</xsl:comment>' },
  { label: 'xsl:strip-space', detail: 'Boşluk temizle', insertText: '<xsl:strip-space elements="$0"/>' },
];

const XSLT_ATTRIBUTES: Array<{ label: string; detail: string; insertText: string }> = [
  { label: 'select', detail: 'XPath seçimi', insertText: 'select="$0"' },
  { label: 'match', detail: 'Şablon eşleşmesi', insertText: 'match="$0"' },
  { label: 'test', detail: 'Koşul ifadesi', insertText: 'test="$0"' },
  { label: 'name', detail: 'Ad', insertText: 'name="$0"' },
  { label: 'mode', detail: 'Mod', insertText: 'mode="$0"' },
  { label: 'priority', detail: 'Öncelik', insertText: 'priority="$0"' },
  { label: 'disable-output-escaping', detail: 'Kaçışı kapat (dikkatli kullanın)', insertText: 'disable-output-escaping="yes"' },
  { label: 'xmlns:xsl', detail: 'XSLT ad alanı', insertText: 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"' },
];

const UBLLR_NAMESPACES = [
  'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
  'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"',
];

/** UBL-TR alan yolları — sık kullanılanlar (ipucu amaçlı). */
const UBL_PATHS: Array<{ label: string; detail: string }> = [
  { label: '//*[local-name()=\'ID\']', detail: 'Belge numarası' },
  { label: '//*[local-name()=\'UUID\']', detail: 'ETTN' },
  { label: '//*[local-name()=\'IssueDate\']', detail: 'Düzenleme tarihi' },
  { label: '//*[local-name()=\'IssueTime\']', detail: 'Düzenleme saati' },
  { label: '//*[local-name()=\'AccountingSupplierParty\']', detail: 'Satıcı (firma)' },
  { label: '//*[local-name()=\'AccountingCustomerParty\']', detail: 'Alıcı (müşteri)' },
  { label: '//*[local-name()=\'PartyName\']/*[local-name()=\'Name\']', detail: 'Ünvan' },
  { label: '//*[local-name()=\'PartyIdentification\']/*[local-name()=\'ID\']', detail: 'VKN / TCKN' },
  { label: '//*[local-name()=\'InvoiceLine\']', detail: 'Fatura satırları' },
  { label: '//*[local-name()=\'InvoicedQuantity\']', detail: 'Miktar' },
  { label: '//*[local-name()=\'PriceAmount\']', detail: 'Birim fiyat' },
  { label: '//*[local-name()=\'LineExtensionAmount\']', detail: 'Satır tutarı' },
  { label: '//*[local-name()=\'TaxAmount\']', detail: 'Vergi tutarı' },
  { label: '//*[local-name()=\'TaxTotal\']', detail: 'Vergi toplamı' },
  { label: '//*[local-name()=\'LegalMonetaryTotal\']', detail: 'Yasal parasal toplam' },
  { label: '//*[local-name()=\'PayableAmount\']', detail: 'Ödenecek tutar' },
  { label: '//*[local-name()=\'Note\']', detail: 'Not' },
];

function registerXsltLanguage(monaco: any) {
  // XML grameri zaten kayıtlı (editor.main → basic-languages/xml). Üzerine
  // XSLT için ayrı bir dil kimliği TANIMLAMIYORUZ: aynı grameri kullanmak
  // dosyayı doğru renklendirir. Yalnızca tamamlama ve ipucu sağlıyoruz.
  const LANG = 'xml';

  monaco.languages.registerCompletionItemProvider(LANG, {
    triggerCharacters: ['<', '/', ':', ' ', '"', "'", '$'],
    provideCompletionItems: (model: any, position: any) => {
      const lineText: string = model.getLineContent(position.lineNumber);
      const before = lineText.slice(0, position.column - 1);
      const wordInfo = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn,
        endColumn: wordInfo.endColumn,
      };

      const suggestions: any[] = [];

      const inTag = /<[^>]*$/.test(before);
      const inAttrValue = /=\s*"[^"]*$/.test(before) || /=\s*'[^']*$/.test(before);

      // `<` sonrası: eleman önerileri
      if (inTag && !inAttrValue) {
        for (const el of XSLT_ELEMENTS) {
          suggestions.push({
            label: el.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            detail: el.detail,
            documentation: 'XSLT 1.0 elemanı (tarayıcı motorunda çalışır)',
            insertText: el.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          });
        }
      }

      // Etiket içinde boşluk sonrası: nitelik önerileri
      if (inTag && /\s\S*$/.test(before) && !inAttrValue) {
        for (const at of XSLT_ATTRIBUTES) {
          suggestions.push({
            label: at.label,
            kind: monaco.languages.CompletionItemKind.Property,
            detail: at.detail,
            insertText: at.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          });
        }
        for (const ns of UBLLR_NAMESPACES) {
          suggestions.push({
            label: ns.split('=')[0],
            kind: monaco.languages.CompletionItemKind.Property,
            detail: 'UBL-TR ad alanı',
            insertText: ns + '$0',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          });
        }
      }

      // XPath bekleyen nitelik değeri içinde: alan yolları
      if (inAttrValue) {
        const attrMatch = /(select|test|match)\s*=\s*["'][^"']*$/.exec(before);
        if (attrMatch) {
          for (const p of UBL_PATHS) {
            suggestions.push({
              label: p.label,
              kind: monaco.languages.CompletionItemKind.Field,
              detail: p.detail,
              documentation: 'UBL-TR alan yolu — şablonunuzda kullanılan ad alanı önekine göre uyarlayın',
              insertText: p.label,
              range,
            });
          }
        }
      }

      return { suggestions };
    },
  });

  monaco.languages.registerHoverProvider(LANG, {
    provideHover: (model: any, position: any) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const known = XSLT_ELEMENTS.find(e => e.label === word.word);
      if (known) {
        return {
          range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          contents: [{ value: `**${known.label}** — ${known.detail}` }],
        };
      }
      return null;
    },
  });
}

/** Monaco'da kullanılacak koyu/açık tema adı. */
const THEME_LIGHT = 'isbey-xslt-light';
const THEME_DARK = 'isbey-xslt-dark';

function defineThemes(monaco: any) {
  monaco.editor.defineTheme(THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'tag', foreground: 'b81423' },
      { token: 'attribute.name', foreground: '0b6b52' },
      { token: 'attribute.value', foreground: '1a4f8a' },
      { token: 'comment', foreground: '7b8494', fontStyle: 'italic' },
      { token: 'delimiter', foreground: '444a5a' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1a1f2e',
      'editorLineNumber.foreground': '#9aa3b2',
      'editorLineNumber.activeForeground': '#d12131',
      'editor.lineHighlightBackground': '#f5f7fa',
      'editor.selectionBackground': '#d1213122',
      'editorIndentGuide.background1': '#edf1f7',
      'editorGutter.background': '#ffffff',
    },
  });
  monaco.editor.defineTheme(THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [{ token: 'comment', foreground: '97a1b4', fontStyle: 'italic' }],
    colors: {
      'editor.background': '#131820',
      'editor.lineHighlightBackground': '#1e2632',
      'editorLineNumber.activeForeground': '#ef5350',
      'editorGutter.background': '#131820',
    },
  });
}

/** Uygulamanın koyu temada olup olmadığını sayfadan okur. */
function detectDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  if (root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark') return true;
  return document.body?.classList.contains('dark') === true;
}

/** Yükleme hatası durumunda gösterilen geri dönüş editörü. */
const FallbackNotice: React.FC<{ message: string }> = ({ message }) => (
  <div
    style={{
      padding: '12px 14px',
      fontSize: '11.5px',
      color: 'var(--danger)',
      background: 'var(--color-danger-bg)',
      borderBottom: '1px solid var(--border-color)',
      lineHeight: 1.5,
    }}
  >
    <strong>Kod editörü yüklenemedi.</strong> {message} Metin alanı kullanılıyor; düzenleme yapılabilir
    ancak satır numarası ve renklendirme yoktur.
  </div>
);

export const MonacoXsltEditor: React.FC<MonacoXsltEditorProps> = ({
  value,
  onChange,
  markers = [],
  readOnly = false,
  height = '100%',
  onReady,
  onCursorChange,
  onEditCommitted,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const onChangeRef = useRef(onChange);
  const onCommittedRef = useRef(onEditCommitted);
  const suppressRef = useRef(false);

  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [loadError, setLoadError] = useState<string>('');
  /** Monaco yüklenemezse kullanılan yerel metin. */
  const [fallbackText, setFallbackText] = useState(value);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });

  onChangeRef.current = onChange;
  onCommittedRef.current = onEditCommitted;

  // ── Editörü kur (Monaco'yu TEMBEL yükle)
  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        // İŞÇİ (worker) YAPILANDIRMASI — Monaco'ya ÖZGÜ, atlanırsa çalışmaz.
        //
        // NEDEN BURADA: Monaco işçileri `MonacoEnvironment.getWorker` çağrısıyla
        // ister. Vite'ta `?worker` içe aktarımı yoksa Monaco işçi oluşturamaz ve
        // düzenleyici "Worker is not defined" hatalarıyla yarı çalışır hâle gelir
        // (katlama, sözcük tamamlama, arama sınırı bozulur). Yapılandırma
        // DİNAMİK yapılır; böylece işçi dosyası da Monaco ile aynı anda,
        // yalnız bu ekran açıldığında yüklenir.
        //
        // Yalnız TEMEL işçi gerekir: `xml` dili temel (basic-language) grameridir
        // ve ayrı bir dil sunucusu işçisi yoktur.
        if (!(self as any).MonacoEnvironment) {
          const workerMod: any = await import('monaco-editor/esm/vs/editor/editor.worker?worker');
          const EditorWorker = workerMod.default ?? workerMod;
          (self as any).MonacoEnvironment = {
            getWorker: () => new EditorWorker(),
          };
        }

        const mod = await import('monaco-editor');
        if (disposed) return;
        const monaco: any = (mod as any).default ?? mod;

        monacoRef.current = monaco;
        defineThemes(monaco);
        registerXsltLanguage(monaco);

        if (!hostRef.current) return;

        const editor = monaco.editor.create(hostRef.current, {
          value,
          language: 'xml',
          theme: detectDarkMode() ? THEME_DARK : THEME_LIGHT,
          readOnly,
          // ── İstenen özellikler
          lineNumbers: 'on',
          minimap: { enabled: false },
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          matchBrackets: 'always',
          autoIndent: 'advanced',
          formatOnPaste: false,
          formatOnType: false,
          folding: true,
          foldingStrategy: 'indentation',
          showFoldingControls: 'mouseover',
          find: { addExtraSpaceOnTop: false, seedSearchStringFromSelection: 'selection' },
          wordWrap: 'off',
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          tabSize: 2,
          insertSpaces: true,
          detectIndentation: false,
          renderWhitespace: 'selection',
          guides: { indentation: true, bracketPairs: true },
          fontSize: 12.5,
          fontFamily: '"JetBrains Mono", "Cascadia Mono", Consolas, "Courier New", monospace',
          fontLigatures: false,
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
          overviewRulerBorder: false,
          stickyScroll: { enabled: false },
          unicodeHighlight: { ambiguousCharacters: false },
          contextmenu: true,
          quickSuggestions: { other: true, comments: false, strings: true },
          suggestOnTriggerCharacters: true,
          padding: { top: 8, bottom: 8 },
        });

        editorRef.current = editor;

        editor.onDidChangeModelContent(() => {
          if (suppressRef.current) return;
          onChangeRef.current(editor.getValue());
        });

        // Düzenleme "tamamlandı" anı: Monaco kendi undo yığınını yönetir ama
        // düğmelerimiz ve kirli-durum takibi için ayrıca bildiriyoruz.
        editor.onDidBlurEditorWidget?.(() => {
          onCommittedRef.current?.(editor.getValue());
        });

        editor.onDidChangeCursorPosition((e: any) => {
          const pos = { line: e.position.lineNumber, column: e.position.column };
          setCursor(pos);
          onCursorChange?.(pos);
        });

        // Ctrl+S: kaydetmeyi uygulamaya bırak (tarayıcı kaydetme diyaloğu açılmasın)
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          window.dispatchEvent(new CustomEvent('isbey-xslt-save'));
        });

        setStatus('ready');

        onReady?.({
          revealMarker: (m) => {
            const line = Math.max(1, Math.min(m.line, editor.getModel()?.getLineCount() ?? 1));
            const col = Math.max(1, m.column || 1);
            editor.revealLineInCenter(line);
            editor.setPosition({ lineNumber: line, column: col });
            editor.focus();
            const deco = editor.deltaDecorations([], [{
              range: new monaco.Range(line, 1, line, 1),
              options: {
                isWholeLine: true,
                className: m.severity === 'warning' ? 'isbey-marker-warning' : 'isbey-marker-error',
                overviewRuler: {
                  color: m.severity === 'warning' ? '#e8a23d' : '#ef5350',
                  position: monaco.editor.OverviewRulerLane.Right,
                },
              },
            }]);
            decorationsRef.current = deco;
          },
          format: () => editor.getAction('editor.action.formatDocument')?.run(),
          focus: () => editor.focus(),
          getValue: () => editor.getValue(),
          trigger: (actionId: string) => editor.trigger('isbey', actionId, null),
        });
      } catch (err: any) {
        if (disposed) return;
        // Sessizce boş gösterme: nedenini yaz, metin alanıyla devam et.
        setLoadError(String(err?.message || err).slice(0, 200));
        setStatus('failed');
      }
    })();

    return () => {
      disposed = true;
      try {
        editorRef.current?.dispose();
      } catch {
        /* yok sayılır */
      }
      editorRef.current = null;
    };
    // Editör BİR KEZ kurulur; değer güncellemeleri ayrı effect'te yapılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Dışarıdan gelen değer değişikliklerini editöre yansıt.
  // (Geri al / ileri al / dosya yükleme / biçimlendirme)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      setFallbackText(value);
      return;
    }
    if (editor.getValue() === value) return;
    suppressRef.current = true;
    // İmleç konumunu koru: kullanıcı metnin ortasında çalışıyorsa başa atma.
    const pos = editor.getPosition();
    editor.setValue(value);
    if (pos) editor.setPosition(pos);
    suppressRef.current = false;
  }, [value]);

  // ── readOnly değişimi
  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  // ── Doğrulayıcı konumlarını Monaco marker'ı olarak uygula
  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor) return;
    const model = editor.getModel();
    if (!model) return;

    const maxLine = model.getLineCount();
    const valid = markers.filter(m => m.line >= 1 && m.line <= maxLine);

    const set = valid.map(m => ({
      startLineNumber: m.line,
      startColumn: Math.max(1, m.column || 1),
      endLineNumber: m.line,
      endColumn: Math.max(1, m.column || 1) + 1,
      message: m.detail ? `${m.message}\n\n${m.detail}` : m.message,
      severity: m.severity === 'warning'
        ? monaco.MarkerSeverity.Warning
        : monaco.MarkerSeverity.Error,
    }));

    monaco.editor.setModelMarkers(model, 'isbey-xslt-validator', set);
  }, [markers, status]);

  // ── Koyu/açık tema değişimi (uygulama teması değişirse)
  useEffect(() => {
    if (!monacoRef.current || !editorRef.current) return;
    const observer = new MutationObserver(() => {
      monacoRef.current?.editor.setTheme(detectDarkMode() ? THEME_DARK : THEME_LIGHT);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => observer.disconnect();
  }, []);

  if (status === 'failed') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height, minHeight: 0 }}>
        <FallbackNotice message={loadError} />
        <textarea
          data-testid="editor-fallback"
          value={fallbackText}
          readOnly={readOnly}
          onChange={e => {
            setFallbackText(e.target.value);
            onChangeRef.current(e.target.value);
          }}
          spellCheck={false}
          style={{
            flex: 1,
            minHeight: 0,
            width: '100%',
            resize: 'none',
            border: 'none',
            outline: 'none',
            padding: '10px 12px',
            fontFamily: '"JetBrains Mono", Consolas, monospace',
            fontSize: '12px',
            lineHeight: 1.55,
            background: 'var(--bg-surface)',
            color: 'var(--text-main)',
            tabSize: 2,
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {status === 'loading' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            background: 'var(--bg-surface)',
            zIndex: 3,
          }}
        >
          <span className="spin" style={{ display: 'inline-block' }}>◌</span>
          Kod editörü yükleniyor…
        </div>
      )}
      <div ref={hostRef} data-testid="monaco-host" style={{ flex: 1, minHeight: 0 }} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
          padding: '3px 10px',
          borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-surface-secondary)',
          fontSize: '10.5px',
          color: 'var(--text-muted)',
          flexShrink: 0,
        }}
      >
        <span>
          Satır {cursor.line}, Kolon {cursor.column}
        </span>
        <span style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {markers.length > 0 && (
            <span style={{ color: markers.some(m => m.severity === 'error') ? 'var(--danger)' : 'var(--warning)', fontWeight: 700 }}>
              {markers.filter(m => m.severity === 'error').length} hata
              {markers.some(m => m.severity === 'warning') &&
                `, ${markers.filter(m => m.severity === 'warning').length} uyarı`}
            </span>
          )}
          <span>XSLT 1.0 · XML</span>
        </span>
      </div>
    </div>
  );
};

export default MonacoXsltEditor;
