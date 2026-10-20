#!/usr/bin/env python3
"""
İŞBEY — DEPO/TENANT BACKFILL UYGULAMA (KAPILI, GERİ ALINABİLİR)
================================================================
Canlı `database.prod.json` üzerinde backfill'i UYGULAR. Varsayılan davranış
DRY-RUN'dır; yazmak için açık onay gerekir.

Kullanım:
    # 1) Önce her zaman kuru koşum (hiçbir şey yazmaz)
    python3 tools/backfill-apply.py <db.json>

    # 2) Onaylı uygulama — sha256 operatör tarafından ÖLÇÜLÜP verilir
    python3 tools/backfill-apply.py <db.json> \
        --expect-sha256 <64-haneli-özet> --confirm APPLY

Kapılar (herhangi biri düşerse YAZILMAZ):
  G1. `--expect-sha256` verilmezse veya dosyanın özeti uyuşmazsa → DUR.
      (Yanlış dosyayı — ör. bayat kopyayı — uygulamayı engeller.)
  G2. BELİRSİZ kayıt varsa → DUR. Sahipliği kanıtlanamayan kayıt taşınmaz.
  G3. Değişmezlik ihlali varsa → DUR. (stok/cari/fatura/finansal alan)
  G4. Kalan sahipsiz iş kaydı varsa → DUR (açık `--allow-remaining` yoksa).
  G5. Değişiklik yoksa → yazmaz, "zaten uygulanmış" der (IDEMPOTENT).

Geri alma:
  Tam yedek  : <db>.pre-backfill-<zaman>.bak   (sha256'sı basılır)
  Cerrahi    : <db>.pre-backfill-<zaman>.beads.json — yalnız dokunulan
               alanların önceki değerleri; `rollback` alt komutuyla geri yazar.

    python3 tools/backfill-apply.py <db.json> rollback <beads.json>

DİKKAT: Sunucu DB dosyasını YALNIZ AÇILIŞTA okur. Dosya değiştirildikten
sonra süreç yeniden başlatılmadan yeni veri görünmez.
"""
import argparse
import datetime
import hashlib
import json
import os
import shutil
import sys
import tempfile

import backfill_lib as lib

CONFIRM_TOKEN = 'APPLY'


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def atomic_write_json(path, data):
    """Aynı dizinde geçici dosya + fsync + os.replace.

    NEDEN: doğrudan `open(path,'w')` yazımı yarıda kalırsa canlı DB dosyası
    BOZUK kalır ve uygulama bir daha açılmaz. `os.replace` aynı dosya
    sisteminde atomiktir: ya eski dosya ya yeni dosya görünür, yarısı asla.
    """
    directory = os.path.dirname(os.path.abspath(path)) or '.'
    fd, tmp = tempfile.mkstemp(prefix='.backfill-', suffix='.tmp', dir=directory)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        # İzinleri kaynak dosyayla eşle (yoksa 0600 kalır ve sunucu okuyamaz).
        try:
            st = os.stat(path)
            os.chmod(tmp, st.st_mode & 0o777)
        except OSError:
            pass
        os.replace(tmp, path)
        tmp = None
    finally:
        if tmp and os.path.exists(tmp):
            os.unlink(tmp)


def cleanup_stale_temps(path):
    """Yarıda kalmış yazımlardan arta kalan `.backfill-*.tmp` dosyalarını siler.

    NEDEN: `atomic_write_json` yazma sırasında öldürülürse (ölçüldü: SIGKILL)
    canlı DB SAĞLAM kalır ama geçici dosya DİSKTE kalır. O dosya tam bir DB
    kopyasıdır — birikmesi hem disk hem de veri kopyası fazlalığı demektir.
    Yalnız aynı dizindeki kendi ön ekimizi hedefler.
    """
    directory = os.path.dirname(os.path.abspath(path)) or '.'
    removed = 0
    try:
        for name in os.listdir(directory):
            if name.startswith('.backfill-') and name.endswith('.tmp'):
                try:
                    os.unlink(os.path.join(directory, name))
                    removed += 1
                except OSError:
                    pass
    except OSError:
        pass
    return removed


def do_rollback(db_path, beads_path):
    db = json.load(open(db_path, encoding='utf-8'))
    snapshot = json.load(open(beads_path, encoding='utf-8'))
    backup = beads_path.replace('.beads.json', '.bak')
    if os.path.exists(backup):
        print(f'NOT: tam yedek mevcut — en güvenli geri alma onu yerine koymaktır:')
        print(f'     cp "{backup}" "{db_path}"  → sonra sunucuyu yeniden başlatın')
    restored, removed = lib.apply_beads(db, snapshot)
    atomic_write_json(db_path, db)
    print(f'GERİ ALINDI: {restored} kayıtta tenantId/companyId/warehouseId eski hâline döndü; '
          f'{removed} backfill kaydı silindi.')
    print('DİKKAT: Sunucu yeniden başlatılmadan değişiklik görünmez.')
    return 0


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument('db')
    ap.add_argument('command', nargs='?', default='apply',
                    choices=['apply', 'rollback'])
    ap.add_argument('beads', nargs='?', default=None)
    ap.add_argument('--expect-sha256', default=None)
    ap.add_argument('--confirm', default=None)
    ap.add_argument('--allow-remaining', action='store_true')
    args = ap.parse_args()

    if args.command == 'rollback':
        if not args.beads:
            print('rollback için <beads.json> yolu gerekli.', file=sys.stderr)
            return 2
        return do_rollback(args.db, args.beads)

    if not os.path.exists(args.db):
        print(f'dosya yok: {args.db}', file=sys.stderr)
        return 2

    print('=' * 74)
    print('İŞBEY BACKFILL UYGULAMA')
    print('=' * 74)
    src_sha = sha256_file(args.db)
    print(f'dosya      : {args.db}')
    print(f'sha256     : {src_sha}')
    print(f'onay       : {"VERİLDİ (" + CONFIRM_TOKEN + ")" if args.confirm == CONFIRM_TOKEN else "YOK → SADECE KURU KOŞUM"}')

    original = json.load(open(args.db, encoding='utf-8'))
    res = lib.build_plan(original)
    plan = res['plan']
    changes = res['changes']
    uncertain = res['uncertain']
    remaining = res['remaining']

    print(f'\ndeğişiklik : {len(changes)}')
    print(f'belirsiz   : {len(uncertain)}')
    print(f'kalan sahipsiz: {sum(len(v) for v in remaining.values())}')
    print(f'sarkan     : {lib.dangling(plan)}')

    total = sum(len(v) for v in remaining.values())
    for coll, ids in sorted(remaining.items()):
        print(f'   kalan {coll:24} {len(ids)}: {ids[:5]}')

    inv = lib.invariants(original, res)
    print('\nDeğişmezlik:')
    inv_ok = True
    for label, b, a, ok in inv:
        inv_ok = inv_ok and ok
        print(f'  {"OK " if ok else "İHLAL"} {label:44} {b} -> {a}')

    # ── KAPILAR ──
    print('\n' + '─' * 74)
    blocked = []
    if args.expect_sha256 is None:
        blocked.append('G1: --expect-sha256 verilmedi')
    elif args.expect_sha256.lower() != src_sha:
        blocked.append(f'G1: sha256 UYUŞMUYOR (beklenen {args.expect_sha256[:16]}…, ölçülen {src_sha[:16]}…)')
    if uncertain:
        blocked.append(f'G2: {len(uncertain)} belirsiz kayıt — sahipliği kanıtlanamayan kayıt TAŞINMAZ')
    if not inv_ok:
        blocked.append('G3: değişmezlik ihlali')
    if total and not args.allow_remaining:
        blocked.append(f'G4: {total} sahipsiz iş kaydı kalıyor (--allow-remaining verilmedi)')
    if args.confirm != CONFIRM_TOKEN:
        blocked.append('G5: --confirm APPLY verilmedi')
    if not changes:
        blocked.append('G6: yapılacak değişiklik YOK (zaten uygulanmış)')

    for b in blocked:
        print(f'  X  {b}')
    print('─' * 74)

    if blocked:
        print('\nYAZILMADI. Hiçbir şey değişmedi.')
        # "Zaten uygulanmış" durumunu normal çıkış say (yeniden koşum güvenli).
        if changes == [] and not uncertain and inv_ok:
            print('DURUM: IDEMPOTENT — plan boş, dosya zaten istenen hâlde.')
            return 0
        return 3

    # ── YEDEK ──
    stale = cleanup_stale_temps(args.db)
    if stale:
        print(f'\nnot: {stale} adet yarıda kalmış geçici dosya temizlendi')
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = f'{args.db}.pre-backfill-{stamp}.bak'
    shutil.copy2(args.db, backup)
    bak_sha = sha256_file(backup)
    if bak_sha != src_sha:
        print(f'DUR: yedek özeti kaynakla uyuşmuyor ({bak_sha} != {src_sha})', file=sys.stderr)
        return 4
    print(f'\nyedek      : {backup}')
    print(f'yedek sha  : {bak_sha}')

    beads_path = f'{args.db}.pre-backfill-{stamp}.beads.json'
    snapshot = lib.bead_snapshot(original)
    # Backfill'in OLUŞTURDUĞU kayıtlar (yeni depo) rollback'te SİLİNMELİ;
    # yoksa geri alma "tam" olmaz (2026-10-20'de ölçülen kusur).
    snapshot['created'] = res['created']
    with open(beads_path, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, ensure_ascii=False)
    print(f'cerrahi sn.: {beads_path} (silinecek kayıt: {len(res["created"])})')

    # ── YAZ ──
    atomic_write_json(args.db, plan)
    new_sha = sha256_file(args.db)
    print(f'\nYAZILDI    : {args.db}')
    print(f'yeni sha   : {new_sha}')

    with open(f'{args.db}.backfill-{stamp}.report.json', 'w', encoding='utf-8') as f:
        json.dump({'ts': stamp, 'from_sha256': src_sha, 'to_sha256': new_sha,
                   'backup': backup, 'beads': beads_path,
                   'changes': changes,
                   'invariants': [{'ad': a, 'once': b, 'sonra': c, 'gecti': d}
                                  for a, b, c, d in inv]},
                  f, ensure_ascii=False, indent=2)
    print(f'rapor      : {args.db}.backfill-{stamp}.report.json')

    print('\n' + '─' * 74)
    print('GERİ ALMA')
    print('─' * 74)
    print(f'  Tam    : cp "{backup}" "{args.db}"')
    print(f'  Cerrahi: python3 tools/backfill-apply.py "{args.db}" rollback "{beads_path}"')
    print('  Her iki durumda da sunucu YENİDEN BAŞLATILMALIDIR (DB açılışta okunur).')
    print('\nSIRADAKİ ADIM: doğrulama betiğini koştur →')
    print(f'  python3 tools/backfill-verify.py "{args.db}"')
    return 0


if __name__ == '__main__':
    sys.exit(main())
