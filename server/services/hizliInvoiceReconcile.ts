import { HizliConnectService } from './hizliConnectService';
import { ensureTenantToken } from './hizliTenantCredentialRegistry';
import type { TenantEinvoiceSettings } from '../db/schema';

/**
 * SENDING MUTABAKATI — 2026-09-25
 * ========================================================================
 * NEDEN GEREKLİ:
 * `hizliInvoiceDispatch` ağ çağrısından ÖNCE faturayı `SENDING` yapıp
 * kalıcılaştırır; yanıt belirsizse (`requiresReconciliation`) kaydı bilinçli
 * olarak `SENDING` bırakır ki mükerrer belge üretilmesin. Bu tasarım doğru —
 * ancak kilidi ÇÖZECEK bir yol yoktu. Transport kesintisi yaşandığında fatura
 * kalıcı olarak kilitli kalıyor, operatörün elinde hiçbir araç olmuyordu.
 *
 * Bu modül yalnızca SORGULAR ve gerçeği yazar. Belge GÖNDERMEZ.
 *
 * KURAL: Sağlayıcı belgeyi tanımıyorsa kayıt DEĞİŞTİRİLMEZ. "Bulunamadı"
 * cevabı "gönderilmedi" demek değildir (sağlayıcı indeksi gecikebilir);
 * yalnızca operatöre raporlanır. Uydurma durum yazılmaz (CLAUDE.md md.1).
 */

/** Sağlayıcının "zarf GİB'e iletildi" başarı kodu. */
const ENVELOPE_SUCCESS = 1300;

export interface ReconcileOutcome {
  invoiceId: string;
  invoiceNo: string;
  /**
   * 'FOUND'        → sağlayıcıda belge var, zarf başarıyla tamamlandı, kayıt güncellendi
   * 'AT_PROVIDER'  → belge var ama zarf henüz tamamlanmadı; durum DEĞİŞTİRİLMEDİ
   * 'NOT_FOUND'    → sorgu BAŞARILI ve belge yok; durum DEĞİŞTİRİLMEDİ
   * 'QUERY_FAILED' → sorgu YAPILAMADI (ağ/token/yanıt hatası); durum DEĞİŞTİRİLMEDİ
   * 'NO_UUID'      → ETTN yok, aranamaz; durum DEĞİŞTİRİLMEDİ
   */
  result: 'FOUND' | 'AT_PROVIDER' | 'NOT_FOUND' | 'QUERY_FAILED' | 'NO_UUID' | 'SKIPPED';
  previousStatus: string;
  newStatus?: string;
  gibStatus?: string;
  message: string;
}

/**
 * Belgeyi sağlayıcıda arar. AppType tahmin edilmez; iki kapsamda da denenir.
 * Uç çağrısı `HizliConnectService` üzerinden yapılır — kimlik/token başlığı
 * tek noktada yönetilsin diye burada HTTP katmanı tekrar yazılmaz.
 */
async function findDocument(
  uuid: string,
  token: string,
  isTest: boolean
): Promise<
  | { status: 'FOUND'; doc: any }
  | { status: 'ABSENT' }      // sorgu başarılı, belge listede yok
  | { status: 'FAILED'; message: string }  // sorgu yapılamadı — "yok" DENEMEZ
> {
  let lastError = '';
  let basariliSorgu = false;

  for (const appType of [1, 2]) {
    const res = await HizliConnectService.getDocumentListByGUID([uuid], appType, token, isTest);
    if (!res.success) {
      lastError = res.message || 'Belge sorgusu başarısız.';
      continue;
    }
    // HTTP 200 tek başına "belge var" demek değildir.
    if (res.data?.IsSucceeded !== true) {
      lastError = res.data?.Message || 'Sağlayıcı belge sorgusunu doğrulamadı.';
      continue;
    }
    // Bu noktadan itibaren sorgu GERÇEKTEN yapılmıştır: dönen liste güvenilirdir.
    basariliSorgu = true;
    const documents = Array.isArray(res.data.documents) ? res.data.documents : [];
    // Uç `guids` filtresini uygulamayabilir; İSTENEN kimlik listede aranır.
    // Başka bir belgenin sonucunu "bizim belgemiz" saymak uydurma olurdu.
    const doc = documents.find(
      (d: any) => d && Object.values(d).some(
        v => typeof v === 'string' && v.toLowerCase() === uuid.toLowerCase()
      )
    );
    if (doc) return { status: 'FOUND', doc };
  }

  // Sorgu en az bir kez başarıyla yapıldıysa ve belge çıkmadıysa "yok" denebilir.
  // Hiç başarılı sorgu yoksa bu bir ARIZADIR — "belge yok" DEĞİLDİR ve asla
  // öyle raporlanmamalıdır (mükerrer fatura riski).
  if (basariliSorgu) return { status: 'ABSENT' };
  return { status: 'FAILED', message: lastError || 'Sağlayıcıya ulaşılamadı.' };
}

/**
 * Tek bir SENDING faturayı sağlayıcıyla mutabık kılar.
 * Belge bulunursa gerçek durum yazılır; bulunamazsa kayıt değiştirilmez.
 */
export async function reconcileSendingInvoice(
  invoice: any,
  settings: TenantEinvoiceSettings
): Promise<ReconcileOutcome> {
  const base: ReconcileOutcome = {
    invoiceId: invoice.id,
    invoiceNo: invoice.invoiceNo,
    result: 'SKIPPED',
    previousStatus: String(invoice.eInvoiceStatus || ''),
    message: '',
  };

  // ETTN önce kayıttan okunur. Gönderim kesintiye uğradığında `eInvoiceUUID`
  // henüz YAZILMAMIŞ olabilir (başarıdan sonra dolduruluyor) — bu durumda
  // belgenin gerçek kimliği kayıtlı sağlayıcı modelindedir. Oradan okumak
  // UYDURMA değildir: gönderim için üretilen ve kalıcılaştırılmış UUID'dir.
  const recordUuid = typeof invoice.eInvoiceUUID === 'string' ? invoice.eInvoiceUUID.trim() : '';
  const modelUuid = typeof invoice.hizliModel?.invoiceheader?.UUID === 'string'
    ? invoice.hizliModel.invoiceheader.UUID.trim()
    : '';
  const uuid = recordUuid || modelUuid;

  if (!uuid) {
    // ETTN olmadan belge aranamaz. Kimlik hiçbir yerde yoksa sağlayıcıda
    // aranacak bir şey yoktur; durum değiştirilmez.
    return { ...base, result: 'NO_UUID', message: 'Kayıtta ETTN yok — sağlayıcıda aranamaz.' };
  }

  const isTest = settings.environment !== 'PRODUCTION';
  const { token } = await ensureTenantToken(settings, isTest);
  const lookup = await findDocument(uuid, token, isTest);

  if (lookup.status === 'FAILED') {
    // Sorgu yapılamadı. Bu "belge yok" DEĞİLDİR: belge gönderilmiş olabilir ve
    // doğrulayamadığımız için onu yeniden göndermek mükerrer fatura üretir.
    return {
      ...base,
      result: 'QUERY_FAILED',
      message: `Sağlayıcı sorgusu yapılamadı; kayıt değiştirilmedi: ${lookup.message}`,
    };
  }

  if (lookup.status === 'ABSENT') {
    return {
      ...base,
      result: 'NOT_FOUND',
      message: 'Sağlayıcı sorgusu yapıldı, bu ETTN için kayıt yok; kayıt değiştirilmedi.',
    };
  }

  const doc = lookup.doc;
  const envelopeStatus = Number(doc.EnvelopeStatus ?? doc.envelopeStatus);
  const description = doc.EnvelopeExp || doc.StatusExp || doc.Messsage || '';

  if (envelopeStatus !== ENVELOPE_SUCCESS) {
    // Belge sağlayıcıda KAYITLI ama zarf henüz tamamlanmadı. Bu bir ret DEĞİLDİR;
    // "işlemde" durumunu 'REJECTED' diye yazmak gerçeği yanlış aksettirirdi.
    // Kayıt SENDING kalır — kullanıcı belge gerçekten reddedildikten sonra
    // kontrollü biçimde yeniden gönderebilir.
    return {
      ...base,
      result: 'AT_PROVIDER',
      gibStatus: String(envelopeStatus || ''),
      message: `Belge sağlayıcıda kayıtlı ancak zarf tamamlanmadı (durum: ${description || 'bilinmiyor'}). Kayıt değiştirilmedi.`,
    };
  }

  return {
    ...base,
    result: 'FOUND',
    // Zarf başarıyla tamamlandı → belge entegratörce KABUL edildi.
    // GİB sonucu (teslim/ret) ayrıca sorgulanmalıdır.
    newStatus: 'SENT',
    gibStatus: String(envelopeStatus),
    message: description || 'Belge sağlayıcıda bulundu.',
  };
}
