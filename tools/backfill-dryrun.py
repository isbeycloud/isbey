#!/usr/bin/env python3
"""
İŞBEY — DEPO/TENANT BACKFILL DRY-RUN (SALT OKUNUR)
==================================================
Canlı `database.prod.json` kopyası üzerinde çalışır. HİÇBİR ŞEY YAZMAZ;
yalnız planlanan değişikliği hesaplar ve doğrulama sorgularını koşturur.

Kullanım:
    python3 tools/backfill-dryrun.py <girdi.json> [<cikti-onizleme.json>]

Kurallar `tools/backfill_lib.py` içindedir — apply ile ORTAK tek kaynak.
Burada kural YOKTUR; yalnız raporlama vardır. Böylece dry-run'ın onayladığı
plan ile apply'ın uyguladığı plan ayrışamaz.
"""
import hashlib
import json
import sys

import backfill_lib as lib


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else None

    print('=' * 74)
    print('İŞBEY BACKFILL DRY-RUN — SALT OKUNUR (hiçbir şey yazılmaz)')
    print('=' * 74)
    print(f'girdi      : {src}')
    print(f'sha256     : {sha256(src)}')

    d = json.load(open(src, encoding='utf-8'))
    tenants = {t['id']: t for t in d.get('tenants', [])}
    print(f'tenant     : {len(tenants)}')

    res = lib.build_plan(d)
    plan = res['plan']
    changes = res['changes']
    uncertain = res['uncertain']
    remaining = res['remaining']

    if res['existing']:
        print(f'\n!! {lib.NEW_WAREHOUSE_ID} ZATEN VAR — yeni depo açılmayacak.')
        print('   Mevcut kayıt:', json.dumps(res['existing'][0], ensure_ascii=False))

    # ── RAPOR ──
    print('\n' + '─' * 74)
    print('PLANLANAN DEĞİŞİKLİKLER')
    print('─' * 74)
    if not changes:
        print('  (yok)')
    for c in changes:
        if c['field'] == '(YENİ KAYIT)':
            print(f"  + {c['collection']:20} {c['id']}")
            print(f"      {json.dumps(c['to'], ensure_ascii=False)}")
            print(f"      {c['reason']}")
        else:
            print(f"  ~ {c['collection']:20} {c['id']:44} {c['field']} = {c['to']}")
            print(f"      {c['reason']}")

    print('\n' + '─' * 74)
    print(f'BELİRSİZ KAYITLAR (plandan ÇIKARILDI) — {len(uncertain)}')
    print('─' * 74)
    for coll, rid, why in uncertain:
        print(f"  ? {coll:22} {rid!r}")
        print(f"      {why}")
    if not uncertain:
        print('  (yok)')

    print('\n' + '─' * 74)
    print('PLAN SONRASI KALAN SAHİPSİZ İŞ KAYITLARI')
    print('─' * 74)
    if not remaining:
        print('  TEMİZ — sahipsiz iş kaydı kalmadı.')
    for coll, ids in sorted(remaining.items()):
        print(f'  {coll:24} {len(ids)}')
        for i in ids[:10]:
            print(f'       - {i}')
        if len(ids) > 10:
            print(f'       ... +{len(ids)-10}')
    print('  (D5 platform-geneli koleksiyonlar hariç tutuldu)')

    # ── DEĞİŞMEZLİK ──
    print('\n' + '─' * 74)
    print('DEĞİŞMEZLİK KONTROLÜ (backfill iş verisini DEĞİŞTİRMEMELİ)')
    print('─' * 74)
    all_ok = True
    for label, b, a, ok in lib.invariants(d, res):
        all_ok = all_ok and ok
        print(f'  {label:42} {b:>14} -> {a:<14} {"AYNI" if ok else "DEĞİŞTİ !!"}')

    # ── DEĞİŞİKLİK MUHASEBESİ ──
    # Sayı, kendi kendini raporlamamalı: plan ile kaynak alan alan karşılaştırılır.
    rap, ger, ekle, sil, tutuyor = lib.change_accounting(d, res)
    all_ok = all_ok and tutuyor
    print(f'\n  değişiklik muhasebesi: raporlanan {rap} alan + {ekle} yeni kayıt = '
          f'{rap + ekle}; planda ölçülen {ger}; silinen {sil} → '
          f'{"TUTUYOR" if tutuyor else "TUTMUYOR !!"}')

    # ── İKİ PARA GERÇEĞİ ──
    cari, kosan, fark, notlar = lib.chain_balance_drift(res['plan'])
    print('\n' + '─' * 74)
    print('CARİ BAKİYE: İKİ FARKLI BÜYÜKLÜK (karıştırılmamalı)')
    print('─' * 74)
    print(f'  customers[].balance toplamı           : {cari}   ← GERÇEK cari bakiye')
    print(f'  currentTransactions[].balance toplamı : {kosan}   ← KOŞAN bakiye toplamı')
    print(f'  fark                                  : {fark}')
    print('  Açıklama: koşan bakiye her satırda "o ana kadarki" bakiyeyi taşır;')
    print('  toplamı cari bakiyeye eşit DEĞİLDİR. Fark, tutarı 0 olan ama')
    print('  koşan bakiyeyi taşıyan belgelerden gelir:')
    for n in notlar:
        print(f"    - {n['id']} {n['documentNo']}: bakiye {n['balance']} ({n['sebep']})")
    print('  Backfill bu iki sayıyı DEĞİŞTİRMEZ; ikisi de aynı kalmalıdır.')

    print(f'\n  SONUÇ: {"TÜM DEĞİŞMEZLİKLER KORUNDU" if all_ok else "İHLAL VAR — UYGULAMA YAPILMAMALI"}')

    # ── DOĞRULAMA SORGULARI ──
    print('\n' + '─' * 74)
    print('İŞLEM SONRASI DOĞRULAMA SORGULARI')
    print('─' * 74)
    bey = [w for w in plan.get('warehouses', [])
           if w.get('tenantId') == lib.BEYOGLU or w['id'] == lib.NEW_WAREHOUSE_ID]
    print(f'  1. Beyoğlu depo sayısı            : {len(bey)}  (beklenen >=1)')
    print(f'  2. Sarkan warehouseId referansı   : {lib.dangling(plan)}  (beklenen 0)')
    print(f'  3. Sahipsiz iş kaydı              : {sum(len(v) for v in remaining.values())}  (beklenen 0)')
    for tid in tenants:
        n = len([w for w in plan.get('warehouses', []) if w.get('tenantId') == tid])
        print(f'  4. Depo / {tenants[tid]["name"][:28]:30}: {n}')
    print(f'  5. tnt-isbey canlıda var mı?      : '
          f'{"VAR" if "tnt-isbey" in tenants else "YOK (beklenen)"}')

    if out:
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(plan, f, ensure_ascii=False, indent=2)
        print(f'\nönizleme yazıldı: {out}')
        print(f'  sha256 = {sha256(out)}')

    print('\nNOT: Bu bir DRY-RUN çıktısıdır. Canlıya HİÇBİR ŞEY yazılmadı.')
    print(f'UYGULAMA KAPISI: belirsiz={len(uncertain)}, değişmezlik={"GEÇTİ" if all_ok else "KALDI"}')
    return 0 if (all_ok and not uncertain) else 3


if __name__ == '__main__':
    sys.exit(main())
