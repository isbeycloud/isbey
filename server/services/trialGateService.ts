/**
 * İŞBEY CLOUD — Deneme (TRIAL) Kapısı Servisi (2026-10-15)
 * ========================================================
 * İş kuralı (kullanıcı kararı 2026-10-15):
 *   1. Kayıtta e-Dönüşüm seçimi SORULMAZ. Kullanıcı 14 gün boyunca ön
 *      muhasebeyi doğrudan kullanır.
 *   2. 14 gün bitince e-Dönüşüm seçimi ZORUNLUDUR: seçim yapılmadan
 *      veri uçları AÇILMAZ ("Kilitlensin, seçim zorunlu").
 *
 * `expiresAt` tenant üzerinde zaten tutulur (kayıt ve Hızlı Bilişim dönüşümü
 * bu alanı yazar). Bu servis TEK karar kaynağıdır — kontrol her istekte
 * yapılır, böylece süre dolduğu anda kilit devreye girer (arka plan işi
 * gerektirmez).
 *
 * Kural: seçim yapılmadan kilit AÇILMAZ; süre dolmadıysa seçim zorlanmaz.
 */

import { ERP_MENUS } from '../../src/data/erpMenus';
import type { TenantModule } from '../db/schema';

export type TrialGateState =
  | { state: 'ACTIVE'; expiresAt: string; daysRemaining: number }
  | { state: 'DECISION_REQUIRED'; expiresAt: string; daysRemaining: 0 }
  | { state: 'CLOSED'; expiresAt: string; daysRemaining: 0; choice: 'ON_MUHASEBE' | 'E_DONUSUM' };

/**
 * ÖN MUHASEBE MENÜ KAPSAMI (deneme kapsamı).
 * Kullanıcı isteği (2026-10-15): kayıtta müşterinin önüne e-Fatura/e-Belge
 * SEÇİMİ çıkmaz; doğrudan ön muhasebeyi kullanır. Bu yüzden deneme boyunca
 * üyeliğin `allowedMenuIds` alanı e-Dönüşüm menüsü HARİÇ menülerle sınırlanır.
 *
 * NEDEN MENÜ (ve neden bu güvenli): yetki denetimi yalnız Sidebar'da değildir;
 * `menuAllowsPath` sunucuda HER istekte çalışır (authGuards.requireAuth), yani
 * e-Dönüşüm uçları deneme boyunca gerçekten 403 döner.
 *
 * Kapsam plan modüllerinden BAĞIMSIZDIR: kapsam yalnız menüyü daraltır, hizmet
 * paketini büyütmez (plan ∩ kapsam kesişimi geçerlidir).
 */
export const PRE_ACCOUNTING_MENU_IDS: string[] = ERP_MENUS
  .filter(m => m.id !== 'edonusum')
  .map(m => m.id);

/**
 * Deneme bittiğinde kapsam karar ile hizalanır:
 *   E_DONUSUM   → kısıt KALKAR (null = rol belirler); e-belge menüsü açılır.
 *   ON_MUHASEBE → kısıt AYNEN kalır; müşteri "e-Dönüşüm istemiyorum" demiştir,
 *                 dolayısıyla e-Dönüşüm menüleri kapalı kalır. Fikrini
 *                 değiştirirse destek/devreden satış akışı gerekir.
 */
export function menusForChoice(choice: 'ON_MUHASEBE' | 'E_DONUSUM'): string[] | null {
  return choice === 'E_DONUSUM' ? null : [...PRE_ACCOUNTING_MENU_IDS];
}

/**
 * Deneme hizmet paketi: kayıtta müşteriye paket seçtirilmez, ön muhasebe
 * paketi OTOMATİK açılır (kullanıcı isteği 2026-10-15).
 *
 * `selectedServicePlanIds` boş bırakılırsa `serviceEntitlements.serviceMenus`
 * [] döner ve TÜM iş menüleri kapanır — yeni müşteri "hiçbir şey açılmadı"
 * ekranıyla karşılaşırdı. Bu yüzden deneme çekirdeğini (cari/stok/fatura/kasa
 * + RAPORLAR) kapsayan aktif en küçük paket seçilir.
 *
 * NEDEN "EN KÜÇÜK KAPSAYAN" (slug'a göre değil): STARTER'da RAPORLAR modülü
 * yoktur; STARTER seçilseydi rapor uçları servis katmanında 403
 * (SERVICE_ACCESS_DENIED) yerdi ve deneme kapısı hiç devreye giremezdi.
 * e-belge modülleri (EFATURA/EARSIV/…) pakette KALIR — denemedeki GERÇEK
 * kapatma menü kapsamıdır (`allowedMenuIds`, `menuAllowsPath` ile sunucuda
 * her istekte denetlenir). Servis paketi yalnız iş uçlarının (cari, rapor…)
 * açık kalmasını sağlar.
 *
 * DİKKAT: `applyServicePlans` çağrılmaz; yalnız paket kimliği ve modül listesi
 * yazılır. Böylece kaydın kendi kota değerleri (5 kullanıcı / 500 belge /
 * 100 kontör) KORUNUR — paket kotaları deneme kotasını sessizce kısmaz.
 * Uygun paket bulunamazsa `null` döner ve eski davranış (paket seçim ekranı) sürer.
 */
const TRIAL_CORE_MODULES = ['CARI', 'STOK', 'FATURA', 'KASA', 'RAPORLAR'];

export function trialServicePlanSelection(db: {
  subscriptionPlans?: { id: string; slug: string; status: string; activeModules: string[] }[];
}): { planId: string; slug: string; modules: string[] } | null {
  const plans = (db.subscriptionPlans || []).filter(p => p.status === 'ACTIVE' && Array.isArray(p.activeModules) && p.activeModules.length > 0);
  const candidates = plans.filter(p => {
    const mods = p.activeModules.map(m => String(m).toUpperCase());
    if (mods.includes('*')) return false; // Joker plan deneme paketi olamaz.
    return TRIAL_CORE_MODULES.every(c => mods.includes(c));
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.activeModules.length - b.activeModules.length);
  const plan = candidates[0];
  return { planId: plan.id, slug: plan.slug, modules: [...plan.activeModules] };
}

/**
 * Deneme aktif modülleri: planın modüllerinden e-belge modülleri ÇIKARILIR.
 * Gerekçe (kullanıcı kararı 2026-10-15): deneme = YALNIZ ön muhasebe; e-Fatura/
 * e-Belge denemede ne sorulur ne açılır. Servis katmanı (`serviceMenus`) planı
 * yansıttığı için menü kapsamı (`allowedMenuIds`) denemedeki GERÇEK kapatmadır
 * (`menuAllowsPath` sunucuda her istekte çalışır) — ama tenant kaydının
 * `activeModules` alanı da dürüst olmalı: "denemede e-belge yok".
 * E-Dönüşüm modülleri, ücretli başvuru/onay akışıyla (ayrı operatör adımı)
 * sonradan eklenir; bu fonksiyon yalnız kayıttaki ilk değeri üretir.
 */
const TRIAL_EXCLUDED_MODULES = new Set(['EFATURA', 'E_FATURA', 'EARSIV', 'EIRSALIYE', 'ESMM', 'EDEFTER']);

export function trialActiveModules(modules: unknown): TenantModule[] {
  const list = Array.isArray(modules) ? modules : [];
  const kept = [...new Set(list.map(m => String(m).toUpperCase()))]
    .filter(m => !TRIAL_EXCLUDED_MODULES.has(m));
  return kept as TenantModule[];
}

export interface GateTenantShape {
  status?: string;
  expiresAt?: string;
  license?: { isTrial?: boolean; trialDays?: number; endDate?: string };
  edonusumChoice?: 'ON_MUHASEBE' | 'E_DONUSUM';
}

/** Deneme bitiş anı: `license.endDate` öncelikli, yoksa `expiresAt`. */
export function trialEndsAt(tenant: GateTenantShape): string | null {
  const raw = tenant.license?.endDate || tenant.expiresAt;
  return raw ? String(raw) : null;
}

/**
 * Deneme sona ermiş mi? Tarih okunamıyorsa güvenli taraf: SÜRE DOLMAMIŞ sayılır
 * (bozuk tarih yüzünden çalışan bir firmayı kilitlemek veri kaybına yol açar);
 * ancak kayıt akışı `expiresAt`'i her zaman yazdığı için bu yol normalde çalışmaz.
 */
export function isTrialExpired(tenant: GateTenantShape, now: Date = new Date()): boolean {
  const end = trialEndsAt(tenant);
  if (!end) return false;
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(endMs)) return false;
  return now.getTime() >= endMs;
}

/** Kalan gün (yukarı yuvarlanır); süre dolmuşsa 0. */
export function daysRemaining(tenant: GateTenantShape, now: Date = new Date()): number {
  const end = trialEndsAt(tenant);
  if (!end) return 0;
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(endMs)) return 0;
  const diff = endMs - now.getTime();
  return diff <= 0 ? 0 : Math.ceil(diff / (24 * 60 * 60 * 1000));
}

/**
 * Tenant için kapı durumunu hesaplar. Deneme dışı (ücretli) firmalarda seçim
 * zorlanmaz: yalnız `TRIAL` durumu (veya `license.isTrial`) deneme sayılır.
 */
export function evaluateTrialGate(tenant: GateTenantShape, now: Date = new Date()): TrialGateState {
  const end = trialEndsAt(tenant) || now.toISOString();
  const isTrial = tenant.status === 'TRIAL' || tenant.license?.isTrial === true;

  if (!isTrial) {
    return { state: 'ACTIVE', expiresAt: end, daysRemaining: daysRemaining(tenant, now) };
  }

  if (!isTrialExpired(tenant, now)) {
    return { state: 'ACTIVE', expiresAt: end, daysRemaining: daysRemaining(tenant, now) };
  }

  // Deneme doldu: seçim yapılmışsa kapı açılır, yapılmamışsa seçim zorunlu.
  if (tenant.edonusumChoice) {
    return { state: 'CLOSED', expiresAt: end, daysRemaining: 0, choice: tenant.edonusumChoice };
  }
  return { state: 'DECISION_REQUIRED', expiresAt: end, daysRemaining: 0 };
}

/** Seçim ZORUNLU mu (kilitli mi)? true → veri uçları 403 döner. */
export function isDecisionRequired(tenant: GateTenantShape, now: Date = new Date()): boolean {
  return evaluateTrialGate(tenant, now).state === 'DECISION_REQUIRED';
}
