/**
 * XML GÖRÜNTÜLEME BİÇİMLENDİRİCİ (salt gösterim)
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-29 eklendi. Detay ekranının "XML" sekmesi için ham belgeyi girintiler.
 *
 * ⚠️ TEMEL KURAL — İÇERİK DEĞİŞMEZ: Bu fonksiyon yalnızca ETİKETLER ARASINA
 * boşluk/boş satır ekler. Metin düğümlerinin içeriğine, CDATA bloklarına,
 * yorumlara ve XML bildirimine DOKUNMAZ. Amaç okunabilirlik; belgeyi
 * "düzeltmek" değildir. (Aynı kural şablon biçimlendiricisinde de geçerlidir:
 * içerik değişmez, yalnız girinti.)
 *
 * ⚠️ NEDEN KENDİ YAZILDI: Sunucuda XML kitaplığı yoktur ve eklenmemelidir
 * (host'ta native modül derlenemez). Belgeyi ağaca çevirip yeniden SERİLEŞTİRMEK
 * de yanlış olurdu: ad alanı bildirimleri, nitelik sırası ve self-closing
 * biçimi değişirdi; kullanıcı gördüğü XML'in gerçekten belgedeki XML olduğundan
 * emin olamazdı. Bu yüzden serileştirme DEĞİL, yalnız satır düzeni üretilir.
 *
 * ⚠️ AŞIRI BÜYÜK BELGE: Çıktı, belge boyutunun sabit bir katıdır. Yine de bir
 * üst sınır konur; aşarsa biçimlendirme ATLANIR ve ham içerik döner (sessizce
 * kırpılmaz, neden kullanıcıya söylenir).
 */

/** Biçimlendirme uygulanacak en büyük belge (bayt). */
export const MAX_FORMAT_BYTES = 2 * 1024 * 1024;

export interface XmlFormatResult {
  xml: string;
  /** Biçimlendirme uygulandı mı? `false` ise `xml` ham içeriktir. */
  formatted: boolean;
  /** Uygulanmadıysa nedeni (kullanıcıya gösterilir). */
  reason?: string;
}

function girinti(depth: number): string {
  return '  '.repeat(Math.max(0, depth));
}

/**
 * Ham XML'i okunabilir hâle getirir.
 *
 * Korunan bloklar: `<?...?>`, `<!--...-->`, `<![CDATA[...]]>`, `<!DOCTYPE …>`
 * (iç içe `[...]` dahil). Bu bloklar TEK PARÇA olarak, içerikleri
 * değiştirilmeden yerleştirilir.
 *
 * Yerleşim kuralı: içinde yalnız metin bulunan eleman TEK SATIRDA kalır
 * (`<cbc:ID>FTR001</cbc:ID>`). Alt elemanı olan eleman açılır ve çocukları
 * kendi satırlarına yazılır.
 */
export function formatXmlForDisplay(input: string): XmlFormatResult {
  if (typeof input !== 'string' || input.trim() === '') {
    return { xml: '', formatted: false, reason: 'Belge içeriği boş.' };
  }
  if (input.length > MAX_FORMAT_BYTES) {
    return {
      xml: input,
      formatted: false,
      reason: `Belge çok büyük (${Math.round(input.length / 1024)} KB); girintileme atlandı, ham XML gösteriliyor.`,
    };
  }

  const n = input.length;
  const satirlar: string[] = [];
  let i = 0;
  let depth = 0;

  /**
   * Açılmış ama henüz yazılmamış eleman. Çocuğu olup olmadığı ancak bir sonraki
   * belirteç görüldüğünde anlaşılır; bu yüzden tamponda tutulur:
   *   • metin gelirse  → açılış + metin birleşir, kapanış beklenir
   *   • etiket gelirse → açılış kendi satırına yazılır (çocuk var demektir)
   */
  let bekleyenAc = '';
  /** `bekleyenAc` için ayrılmış girinti derinliği. */
  let bekleyenDepth = 0;
  /** Açılış elemanının metin içeriği (varsa). */
  let bekleyenMetin: string | null = null;

  /** Tamponu tek satır olarak boşaltır. */
  const acilisiYaz = () => {
    if (bekleyenAc) {
      satirlar.push(girinti(bekleyenDepth) + bekleyenAc);
      bekleyenAc = '';
      bekleyenMetin = null;
    }
  };

  while (i < n) {
    const lt = input.indexOf('<', i);
    if (lt === -1) {
      // Belgenin sonundaki artık metin (bozuksa da kaybolmaz).
      const kalan = input.slice(i).trim();
      if (kalan) {
        acilisiYaz();
        satirlar.push(girinti(depth) + kalan);
      }
      break;
    }

    // ── Etiketten önceki metin ───────────────────────────────────────────
    if (lt > i) {
      const metin = input.slice(i, lt).trim();
      if (metin) {
        if (bekleyenAc && bekleyenMetin === null) {
          // Bu elemanın metin içeriği: açılışla aynı satırda tutulur.
          bekleyenMetin = metin;
        } else {
          // İç içe metin (karışık içerik): kendi satırına yazılır. XML'de
          // karışık içerik nadirdir ama varsa kaybolmamalıdır.
          acilisiYaz();
          satirlar.push(girinti(depth) + metin);
        }
      }
    }

    // ── Korunan bloklar ─────────────────────────────────────────────────
    if (input.startsWith('<?', lt)) {
      const end = input.indexOf('?>', lt + 2);
      acilisiYaz();
      satirlar.push(girinti(depth) + (end === -1 ? input.slice(lt) : input.slice(lt, end + 2)).trim());
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (input.startsWith('<!--', lt)) {
      const end = input.indexOf('-->', lt + 4);
      acilisiYaz();
      satirlar.push(girinti(depth) + (end === -1 ? input.slice(lt) : input.slice(lt, end + 3)).trim());
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (input.startsWith('<![CDATA[', lt)) {
      const end = input.indexOf(']]>', lt + 9);
      // CDATA içeriği ASLA kırpılmaz ve yeniden girintilenmez.
      const blok = end === -1 ? input.slice(lt) : input.slice(lt, end + 3);
      if (bekleyenAc) {
        bekleyenMetin = (bekleyenMetin ?? '') + blok;
      } else {
        satirlar.push(girinti(depth) + blok);
      }
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (input.startsWith('<!', lt)) {
      // DOCTYPE — iç içe `[...]` barındırabilir.
      let d = 0;
      let j = lt + 2;
      for (; j < n; j++) {
        const ch = input[j];
        if (ch === '[') d++;
        else if (ch === ']') d--;
        else if (ch === '>' && d <= 0) break;
      }
      acilisiYaz();
      satirlar.push(girinti(depth) + (j >= n ? input.slice(lt) : input.slice(lt, j + 1)).trim());
      i = j >= n ? n : j + 1;
      continue;
    }

    // ── Kapanış etiketi ─────────────────────────────────────────────────
    if (input.startsWith('</', lt)) {
      const gt = input.indexOf('>', lt);
      const blok = (gt === -1 ? input.slice(lt) : input.slice(lt, gt + 1)).trim();
      depth = Math.max(0, depth - 1);
      if (bekleyenAc) {
        // Yaprak eleman: açılış + metin + kapanış TEK SATIR.
        satirlar.push(girinti(bekleyenDepth) + bekleyenAc + (bekleyenMetin ?? '') + blok);
        bekleyenAc = '';
        bekleyenMetin = null;
      } else {
        satirlar.push(girinti(depth) + blok);
      }
      i = gt === -1 ? n : gt + 1;
      continue;
    }

    // ── Açılış etiketi (tırnak içindeki '>' atlanır) ─────────────────────
    let quote: string | null = null;
    let gt = -1;
    for (let j = lt + 1; j < n; j++) {
      const ch = input[j];
      if (quote) { if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '>') { gt = j; break; }
    }
    if (gt === -1) {
      // Bozuk belge: kalan olduğu gibi korunur, sessizce atılmaz.
      acilisiYaz();
      satirlar.push(girinti(depth) + input.slice(lt).trim());
      break;
    }

    const govde = input.slice(lt + 1, gt);
    const selfClosing = govde.endsWith('/');
    // Önceki eleman bu etiketle çocuk kazanmış oldu: kendi satırına yazılır.
    acilisiYaz();

    const etiket = input.slice(lt, gt + 1).trim();
    if (selfClosing) {
      satirlar.push(girinti(depth) + etiket);
    } else {
      bekleyenAc = etiket;
      bekleyenDepth = depth;
      bekleyenMetin = null;
      depth++;
    }
    i = gt + 1;
  }

  acilisiYaz();
  return { xml: satirlar.join('\n'), formatted: true };
}
