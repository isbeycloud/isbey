<#
  ISBEY CLOUD - DOGRULAMA PAKETI (tek komut)
  ==========================================
  Amac: FAZ 25.2-C / 25.2-D / 25.3 / 25.4 / 25.5 kalemlerinin KOSU KANITINI
        uretmek. Testlerin hepsi projenin KENDI suitleridir; bu script hicbir
        testi "gecmis" saymaz, yalnizca kosturur ve ciktiyi raporlar.

  ONEMLI TASARIM NOTU - neden IKI ayri sunucu oturumu:
    - Login rate-limit testi 20 istek butcesini 15 DAKIKA boyunca doldurur.
      Suitler de login yaptigi icin ayni surecte kosarlarsa testin kanit degeri
      duser (429 cok erken gelir) ve suitler kilitlenir.
    - Cozum: 1. sunucu yalnizca rate-limit kaniti icin acilir ve kapatilir;
      2. sunucu (taze butce) suitler + diger 25.4/25.5 kanitlari icin acilir.

  KULLANIM (proje kokunde):
    powershell -ExecutionPolicy Bypass -File tools\dogrulama.ps1

  SECENEKLER:
    -SkipRateLimit   : iki rate-limit testini atla (IP 15 dk kilitli kalabilir)
    -SkipHeavy       : 3 aylik muhasebe simulasyonunu atla (yavas)
    -NoBackup        : data/database.json yedegini alma (ONERILMEZ)

  CIKTI:
    .verify-tmp\dogrulama-raporu.txt   <- bu dosyayi Claude'a geri gonderin
    .verify-tmp\cikti-*.txt            <- ham suite ciktilari
    .verify-tmp\sunucu-*.log           <- sunucu loglari
#>

[CmdletBinding()]
param(
  [switch]$SkipRateLimit,
  [switch]$SkipHeavy,
  [switch]$NoBackup
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }
$OutputEncoding = [System.Text.Encoding]::UTF8

# ---------------------------------------------------------------- yerlesim
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root 'server\index.ts'))) { $Root = $PSScriptRoot | Split-Path -Parent }
$Tmp = Join-Path $Root '.verify-tmp'
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null
$Rapor = Join-Path $Tmp 'dogrulama-raporu.txt'

Push-Location $Root

$script:Checks = @()
$script:Fails  = @()

function Yaz {
  param([string]$Metin, [string]$Renk = 'Gray')
  Write-Host $Metin -ForegroundColor $Renk
}

function Add-Check {
  param(
    [string]$Ad,
    [ValidateSet('PASS','FAIL','SKIP','WARN','BLOCKED')][string]$Durum,
    [string]$Detay = '',
    [string]$Kaynak = ''
  )
  $script:Checks += [pscustomobject]@{ Ad = $Ad; Durum = $Durum; Detay = $Detay; Kaynak = $Kaynak }
  if ($Durum -eq 'FAIL') { $script:Fails += ("{0} :: {1}" -f $Ad, $Detay) }
  $renk = switch ($Durum) { 'PASS' { 'Green' } 'FAIL' { 'Red' } 'SKIP' { 'DarkYellow' } 'WARN' { 'Yellow' } 'BLOCKED' { 'Magenta' } default { 'Gray' } }
  Write-Host ("  [{0,-7}] {1}" -f $Durum, $Ad) -ForegroundColor $renk
  if ($Detay) { Write-Host ("            {0}" -f $Detay) -ForegroundColor DarkGray }
}

function Bolum { param([string]$Ad)
  Write-Host ''
  Write-Host ("=" * 72) -ForegroundColor DarkCyan
  Write-Host ("  " + $Ad) -ForegroundColor Cyan
  Write-Host ("=" * 72) -ForegroundColor DarkCyan
}

# ---------------------------------------------------------------- on kontrol
Bolum "0. ON KONTROL"

$Node = (Get-Command node -ErrorAction SilentlyContinue).Source
$Npx  = (Get-Command npx  -ErrorAction SilentlyContinue).Source
if (-not $Node) { Add-Check "node bulundu" 'FAIL' "node PATH'te yok - Node.js kurulu mu?"; Pop-Location; exit 1 }
Add-Check "node bulundu" 'PASS' ("{0}  ({1})" -f $Node, (& $Node -v))
if (-not $Npx) { Add-Check "npx bulundu" 'FAIL' "npx PATH'te yok"; Pop-Location; exit 1 }
Add-Check "npx bulundu" 'PASS' $Npx

# Calistirma yolu probe: "node --import tsx" destekleniyor mu? (yoksa npx yedegi)
$script:NodeTsxModu = $false
try {
  $probeOut = Join-Path $Tmp 'tsx-probe-out.txt'
  $probeErr = Join-Path $Tmp 'tsx-probe-err.txt'
  $pp = Start-Process -FilePath $Node -ArgumentList @('--import', 'tsx', '-e', "console.log('TSX-OK')") `
          -WorkingDirectory $Root -PassThru -WindowStyle Hidden `
          -RedirectStandardOutput $probeOut -RedirectStandardError $probeErr
  if ($pp.WaitForExit(25000)) {
    $script:NodeTsxModu = ((Get-Content $probeOut -Raw -Encoding UTF8 -ErrorAction SilentlyContinue) -match 'TSX-OK')
  } else {
    try { Stop-Process -Id $pp.Id -Force -ErrorAction SilentlyContinue } catch { }
  }
} catch { $script:NodeTsxModu = $false }

# Yedek yol 2: tsx CLI'yi node ile cagirmak (node_modules\tsx\dist\cli.mjs)
$script:TsxCliModu = Test-Path (Join-Path $Root 'node_modules\tsx\dist\cli.mjs')

if ($script:NodeTsxModu) {
  Add-Check "calistirma yolu: node --import tsx" 'PASS' "cmd.exe tirmak riski yok"
} elseif ($script:TsxCliModu) {
  Add-Check "calistirma yolu: node tsx/dist/cli.mjs (yedek-1)" 'WARN' "'node --import tsx' desteklenmiyor; tsx CLI node ile cagrilacak"
} else {
  Add-Check "calistirma yolu: cmd /c npx tsx (yedek-2)" 'WARN' "Her iki node yolu da yok; npx kullanilacak (tirmak riski var)"
}

$nmOk = Test-Path (Join-Path $Root 'node_modules\tsx')
if (-not $nmOk) {
  Add-Check "node_modules (tsx) hazir" 'FAIL' "npm install calistirin: cd `"$Root`"; npm install"
} else {
  Add-Check "node_modules (tsx) hazir" 'PASS' "node_modules\tsx mevcut"
}

# .env anahtarlari (yalnizca varlik/durum okunur - DEGER YAZDIRILMAZ)
# NOT (2026-09-10 / 2026-09-11 duzeltmeleri): Onceki surum Get-Content kullaniyordu ve
# yalnizca 3 anahtar okuyabiliyordu. 2026-09-10'da "satir sonu (CR/LF) karisik"
# varsayildi ve regex ile cozulmeye calisildi; ANCAK kosu #2'de hata AYNEN tekrarladi
# (dosyada 17 anahtar var, script yine 3 okudu). Bu yuzden artik tek bir varsayima
# dayanmayan iki katmanli cozum kullanilir:
#   1) Dosya ham metin olarak okunur; her turlu satir sonu (\r\n, \n, \r) TEK regex
#      ile bolunur — CR/LF karisikligi varsayimina gerek kalmaz. BOM varsa temizlenir.
#   2) Anahtar deseni [regex]::new(..., CultureInvariant) ile kurulur; boylece makine
#      yerel ayari (tr-TR) eslesmeyi degistiremez.
# Ayrica asagida OZ-DENETIM vardir: kac ADAY satir goruldu vs kac anahtar cozuldu
# kiyaslanir; uyusmazsa sessizce PASS/FAIL uretmek yerine acikca FAIL verilir.
$EnvPath = Join-Path $Root '.env'
$EnvMap = @{}
$EnvAdaySayisi = 0
if (Test-Path $EnvPath) {
  $envHam = [System.IO.File]::ReadAllText($EnvPath)
  # BOM temizligi (varsa ilk anahtarin adini bozar)
  if ($envHam.Length -gt 0 -and $envHam[0] -eq [char]0xFEFF) { $envHam = $envHam.Substring(1) }
  # Her turlu satir sonu ayiricisi (CR, LF, CRLF) icin tek regex bolme
  $envSatirlari = $envHam -split "\r\n|\n|\r"
  # Kulturden bagimsiz anahtar deseni: '^[ \t]*AD[ \t]*=[ \t]*(deger)[ \t]*$'
  $envDesen = [regex]::new('^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(.*)$', [System.Text.RegularExpressions.RegexOptions]::CultureInvariant)
  foreach ($satir in $envSatirlari) {
    $t = $satir.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    if ($t.Contains('=')) { $EnvAdaySayisi++ }
    $m = $envDesen.Match($satir)
    if ($m.Success) { $EnvMap[$m.Groups[1].Value] = $m.Groups[2].Value.Trim() }
  }
  # Teshis: kac ADAY satir vardi vs kac anahtar cozuldu. Uyusmuyorsa desen bir seyi
  # kaciriyor demektir -> sessizce yanlis PASS/FAIL uretmek yerine acikca FAIL ver.
  if ($EnvMap.Count -lt $EnvAdaySayisi) {
    Add-Check ".env okundu" 'FAIL' ("{0} aday satirin yalniz {1} tanesi cozuldu - .env bicimi beklenenden farkli" -f $EnvAdaySayisi, $EnvMap.Count)
  } else {
    Add-Check ".env okundu" 'PASS' ("{0} anahtar tanimli" -f $EnvMap.Count)
  }
} else {
  Add-Check ".env mevcut" 'FAIL' ".env yok - .env.example'i kopyalayin"
}

$Port = 4000
if ($EnvMap.ContainsKey('PORT') -and $EnvMap['PORT']) { $Port = [int]$EnvMap['PORT'] }
$Base = "http://127.0.0.1:$Port"
if ($Port -ne 4000) {
  Add-Check "PORT=4000" 'WARN' "PORT=$Port. faz252a / faz25Izolasyon / faz25SecurityGate suitleri 4000'e SABIT kodlu - bu testler basarisiz olabilir. Oneri: .env'de PORT=4000."
} else {
  Add-Check "PORT=4000" 'PASS' "suitlerle uyumlu"
}

# guvenli gorunurluk: secret'larin yalnizca VAR/YOK bilgisi
foreach ($k in @('JWT_SECRET','PAYMENT_WEBHOOK_SECRET','WEBHOOK_SECRET')) {
  $var_ = $EnvMap.ContainsKey($k) -and $EnvMap[$k].Length -gt 0
  Add-Check ("ENV {0} tanimli mi" -f $k) ($(if ($var_) { 'PASS' } else { 'WARN' })) $(if ($var_) { "TANIMLI (deger gizli)" } else { "TANIMSIZ - ilgili webhook fail-closed (503) davranir" })
}
$testMode = $EnvMap['HIZLI_BILISIM_IS_TEST_MODE']
$testModeVar = $EnvMap.ContainsKey('HIZLI_BILISIM_IS_TEST_MODE') -and $EnvMap['HIZLI_BILISIM_IS_TEST_MODE'] -ne ''
if ($testMode -eq 'true') {
  Add-Check "Hizli Bilisim TEST modu kilidi" 'PASS' "HIZLI_BILISIM_IS_TEST_MODE=true (canli QA kapisi KILITLI)"
} elseif (-not $testModeVar) {
  # Onemli ayrim: 'anahtar .env'de YOK' ile 'anahtar var ama false' farkli seylerdir.
  # Kosu #1 ve #2'de bu kalem "DEGER BOS" gorunerek yanlis FAIL uretti; gercek sebep
  # anahtarin okunamamasiydi (yukaridaki .env ayristirmasi). Bu ayrim bir daha
  # yanlis teshise yol acmasin diye metin ACIK yazilir.
  Add-Check "Hizli Bilisim TEST modu kilidi" 'FAIL' "HIZLI_BILISIM_IS_TEST_MODE .env'de BULUNAMADI (okuma hatasi veya anahtar gercekten yok) - canli entegrasyon kapisi DOGRULANAMADI"
} else {
  Add-Check "Hizli Bilisim TEST modu kilidi" 'FAIL' "HIZLI_BILISIM_IS_TEST_MODE='$testMode' (true olmali - CANLI sisteme baglanma riski)"
}

# test sunucu portu 4719 (FAZ 19) - kapsam disi uyari
# 2026-09-15: Dosya adi guncellendi. Eski `testServer19.js` HIC BASLAMIYORDU
# (CommonJS/ESM uyumsuzlugu + cozulemeyen require yollari); yerine ESM tabanli
# `testServer19.mjs` yazildi ve gercek ciktiyla dogrulandi (45/45 PASS).
# Bu script yine de sunucuyu KURMAZ; kalem SKIP kalir - ama artik isaret ettigi
# dosya calisir durumdadir, yani SKIP "test yok" degil "bu paket kurmuyor" demektir.
Add-Check "FAZ19 izole sunucu testi" 'SKIP' "testServer19.mjs + phase19NegativeAccessTest 4719 portunda AYRI bir sunucu ister; bu script onu kurmaz (bkz. rapor sonu NOT)."

# ---------------------------------------------------------------- tip kontrolu & build
# 2026-09-12 (bkz. docs/28 §6 ve §11.6): Onceki kosularda "npx tsc -b -> 0 hata"
# ifadesi SUNUCU KODUNA DAIR KANIT DEGILDI — kok tsconfig.json yalnizca `src` ve
# `vite.config.ts` referanslarini tasir; `server/` hic tip kontrolunden gecmiyordu
# (tsx tipleri silerek calistirir). Ayrica `npm run build` pakette HIC kosulmuyordu.
# Bu bolum ikisini de kanit zincirine ekler.
#
# BEKLENEN (guncel) SONUC:
#   - `tsconfig.server.json` — 2026-09-12 itibariyla 0 HATA. Bilinen 141 hata
#     tavaninin TAMAMI kapatildi (sema/kod uyumsuzlugu giderildi).
#     Bu yuzden artik "0 hata" BEKLENIR ve olculur.
#   - `npm run build` (tsc -b + vite build) — temiz olmasi beklenir (PASS/FAIL).
Bolum "0b. TIP KONTROLU & BUILD (sunucu + frontend)"

# 2026-09-12 GUNCELLEMESI — ESIK 141 -> 0.
# TARIHCE: docs/28 §6 ilk tarama 167 hata, PaymentStatus ayrimi sonrasi 141 kaldi.
# Bu sayi TAVAN olarak kullaniliyordu ("yeni regresyon yok" olcutu). Ancak
# 2026-09-12'de 141 hatanin tamami duzeltildi ve `tsc -p tsconfig.server.json`
# 0 hata / exit 0 verdi.
#
# NEDEN TAVAN KALDIRILMALI: 141'lik gevsek esik, duzeltilen 141 hatanin
# HERHANGI birinin geri gelmesini PASS olarak gecirirdi — yani yeni bir
# regresyon sessizce yesil gorunurdu. Esik artik 0'dir; 1 hata bile FAIL.
# (Onceki `$ServerTscKnownMax` degiskeni kaldirildi: tavansiz karsilastirma
#  artik dogrudan `-eq 0` ile yapiliyor.)
$tscServerYol = Join-Path $Root 'tsconfig.server.json'
if (-not (Test-Path $tscServerYol)) {
  Add-Check "TSC-SERVER sunucu tip kontrolu" 'BLOCKED' "tsconfig.server.json yok - sunucu tip kontrolu kosulamaz"
} else {
  $o1 = Join-Path $Tmp 'cikti-tsc-server.txt'
  $e1 = Join-Path $Tmp 'hata-tsc-server.txt'
  # tsc.cmd dogrudan cagrilir (npx tirmak riski yok); node_modules/.bin icinde.
  $tscCmd = Join-Path $Root 'node_modules\.bin\tsc.cmd'
  if (-not (Test-Path $tscCmd)) {
    Add-Check "TSC-SERVER sunucu tip kontrolu" 'BLOCKED' "node_modules\.bin\tsc.cmd yok - once 'npm install' calistirin"
  } else {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $pr = Start-Process -FilePath $tscCmd -ArgumentList @('-p', 'tsconfig.server.json', '--noEmit') `
            -WorkingDirectory $Root -PassThru -WindowStyle Hidden `
            -RedirectStandardOutput $o1 -RedirectStandardError $e1
    $pr | Wait-Process -Timeout 600 -ErrorAction SilentlyContinue
    if (-not $pr.HasExited) { try { $pr | Stop-Process -Force } catch { } }
    # ExitCode'un kesinlesmesi icin Refresh gerekir (bkz. Invoke-Suite notu).
    try { $pr.Refresh() } catch { }
    $sw.Stop()

    $ham = ''
    foreach ($f in @($o1, $e1)) {
      if (Test-Path $f) { $ham += (Get-Content $f -Raw -Encoding UTF8 -ErrorAction SilentlyContinue) }
    }
    $ham = [string]$ham
    # tsc hata satirlari: "path(3,5): error TS2304: ..."
    $hataSayisi = ([regex]::Matches($ham, 'error TS\d+')).Count

    if ($hataSayisi -eq 0) {
      Add-Check "TSC-SERVER sunucu tip kontrolu" 'PASS' `
        ("0 hata - sunucu tip kontrolu TEMIZ. {0:N1} sn" -f $sw.Elapsed.TotalSeconds)
    } else {
      # Esik 0'dir: tek bir tip hatasi bile regresyondur (FAIL).
      Add-Check "TSC-SERVER sunucu tip kontrolu" 'FAIL' `
        ("$hataSayisi tip hatasi (beklenen 0) -> REGRESYON. Tam liste: hata-tsc-server.txt ({0:N1} sn)" -f $sw.Elapsed.TotalSeconds)
    }
  }
}

# ──────────────────────────────────────────────────────────────────────────
# 2026-09-12 — STATIK KILITLER (adim 8: e-Fatura/e-Arşiv gerçek API akışı)
#
# Bu kalemler API ÇAĞIRMAZ; kaynak kodda düzeltilen davranışın geri
# gelmediğini doğrular. Gerekçe: aşağıdaki üç kusur, "başarısız gönderimi
# başarılı say" sınıfındandır ve muhasebe bütünlüğünü bozar.
# ──────────────────────────────────────────────────────────────────────────

# SEC-007: Canlı (production) Hızlı Bilişim geçişi fail-closed mı?
$efaturaYol = Join-Path $Root 'server\routes\efatura.ts'
# SEC-012 icin yol sabitleri (MOCK sessiz fallback kilidi)
$pfYol = Join-Path $Root 'server\services\providers\providerFactory.ts'
$mpYol = Join-Path $Root 'server\services\providers\mockProvider.ts'
$stYol = Join-Path $Root 'server\routes\v1\e-invoice-settings.ts'
$edYol = Join-Path $Root 'server\routes\v1\e-documents.ts'
$hdYol = Join-Path $Root 'server\routes\hizli-defter.ts'
if (-not (Test-Path $efaturaYol)) {
  Add-Check "SEC-007 production gecis kilidi" 'BLOCKED' "server\routes\efatura.ts bulunamadi"
} else {
  $ef = [System.IO.File]::ReadAllText($efaturaYol)

  # (a) Onay degiskeni kontrolu var mi?
  $kilitVar = $ef.Contains('HIZLI_BILISIM_ALLOW_PROD') -and $ef.Contains('isProductionSwitchAllowed')

  # (b) Kilit kac ucta uygulanmis? (switch-mode, save-credentials, encrypt,
  #     test-connection = en az 4)
  $kilitSayisi = ([regex]::Matches($ef, 'isProductionSwitchAllowed\(\)')).Count

  # (c) Rol kapisi var mi? (matris jeneratörünün tanıması için AÇIK yazılmalı;
  #     takma ad kullanılırsa matris guard'ı göremez → yanlış FAIL üretir)
  $rolSayisi = ([regex]::Matches($ef, "requireRole\('SUPER_ADMIN', 'platform_admin'\)")).Count
  $rolVar = $rolSayisi -ge 6

  # (d) save-credentials guvenli varsayilan (test) mi?
  $varsayilanGuvenli = $ef.Contains('isTestMode = true') -or -not $ef.Contains('isTestMode = false')

  $eksikler = @()
  if (-not $kilitVar)         { $eksikler += 'onay degiskeni yok' }
  if ($kilitSayisi -lt 5)     { $eksikler += "kilit yalniz $kilitSayisi yerde (>=5 beklenir)" }
  if (-not $rolVar)           { $eksikler += 'rol kapisi yok' }
  if (-not $varsayilanGuvenli) { $eksikler += 'save-credentials varsayilani canli' }

  if ($eksikler.Count -eq 0) {
    Add-Check "SEC-007 production gecis kilidi" 'PASS' `
      ("fail-closed: onay degiskeni + rol kapisi + $kilitSayisi kilit noktasi")
  } else {
    Add-Check "SEC-007 production gecis kilidi" 'FAIL' `
      ("EKSIK: " + ($eksikler -join '; '))
  }
}

# SEC-008: send-invoice, entegratör yanıtını DOĞRULAMADAN başarı yazıyor mu?
if (-not (Test-Path $efaturaYol)) {
  Add-Check "SEC-008 send-invoice basari kontrolu" 'BLOCKED' "server\routes\efatura.ts bulunamadi"
} else {
  $ef2 = [System.IO.File]::ReadAllText($efaturaYol)

  # (a) result.success kontrolu var mi?
  $basariKontrol = $ef2.Contains('result.success !== true')

  # (b) Uydurma ETTN uretimi kaldirilmis mi? (eski kod: urn:uuid:${invoiceId})
  $uydurmaEttn = $ef2.Contains('urn:uuid:${invoiceId}')

  # (c) Gercek gonderim yapilmadan APPROVED yaziliyor mu?
  $sahteApprove = $ef2.Contains("sendToGib ? 'APPROVED'")

  # (d) 2026-09-12: batch-send / batch-status-sync uydurma GIB basarisi.
  #     Eski kod hic API cagirmadan `1200` kodu + uydurma `urn:uuid:` UUID
  #     yaziyordu. Bu iki desen geri gelirse FAIL.
  $sahteGibKodu  = ([regex]::Matches($ef2, 'gibStatusCode\s*=\s*1200')).Count -gt 0
  $sahteBatchUuid = $ef2.Contains('urn:uuid:${inv.id}')
  $batchCagriYok  = -not $ef2.Contains('getInvoiceStatus')
  # (e) XML/HTML ciktisinda uydurma ETTN kaliplari
  $sahteXmlEttn  = $ef2.Contains('-4810-5928-1700') -or $ef2.Contains('-GIB-2026')

  $kusurlar = @()
  if (-not $basariKontrol) { $kusurlar += 'send-invoice result.success dogrulamiyor' }
  if ($uydurmaEttn)        { $kusurlar += 'uydurma ETTN uretimi geri gelmis' }
  if ($sahteApprove)       { $kusurlar += 'gonderim yapilmadan APPROVED yaziliyor' }
  if ($sahteGibKodu)       { $kusurlar += 'sabit 1200 GIB kodu yaziliyor (gonderim dogrulanmiyor)' }
  if ($sahteBatchUuid)     { $kusurlar += 'batch-send uydurma UUID uretiyor' }
  if ($batchCagriYok)      { $kusurlar += 'batch-status-sync entegratorden durum sorgulamiyor' }
  if ($sahteXmlEttn)       { $kusurlar += 'XML/HTML ciktisinda uydurma ETTN kalibi var' }

  if ($kusurlar.Count -eq 0) {
    Add-Check "SEC-008 send-invoice basari kontrolu" 'PASS' `
      "entegrator yaniti dogrulaniyor; uydurma ETTN ve sahte APPROVED yok"
  } else {
    Add-Check "SEC-008 send-invoice basari kontrolu" 'FAIL' `
      ("KUSUR: " + ($kusurlar -join '; '))
  }
}

# SEC-011: "Fatura gonderildi" yalnizca GERCEKTEN gonderildiginde soylenir mi?
#
# 2026-09-12'de kapatilan uc kusur:
#   (a) `create-model-invoice` hicbir gonderim yapmadigi halde cagiran ekran
#       "GIB'e Basariyla Iletildi!" yaziyordu (ETTN cogu zaman null ->
#       "ETTN: null" gorunuyordu). Gonderim ayri uca baglandi.
#   (b) `/hizli/send-invoice` kiracı sahiplik kontrolunu AG cagrisindan SONRA
#       yapiyordu: entegratore belge GERCEKTEN gidiyor, kontor tuketiliyor,
#       ardindan 403 "gonderilmedi" deniyordu. Kontrol artik ONCE.
#   (c) Uc `result.uuid` / `result.invoiceNumber` okuyordu; servis ise
#       `{success, data, message}` dondurur -> audit log'a "ETTN: undefined".
if (-not (Test-Path $efaturaYol)) {
  Add-Check "SEC-011 gonderim sonrasi dogru raporlama" 'BLOCKED' "server\routes\efatura.ts bulunamadi"
} else {
  $ef3 = [System.IO.File]::ReadAllText($efaturaYol)

  # (a) Sahiplik kontrolu ag cagrisindan ONCE mi?
  #     Karsilastirma YALNIZ send-invoice ucu govdesine kapsamlanir; aksi halde
  #     create-model-invoice icindeki ayni `requestTenantId` satiri eslesip
  #     yanlis sonuc uretebilir.
  $ucBasi = $ef3.IndexOf("router.post('/hizli/send-invoice'")
  $siraDogru = $false
  if ($ucBasi -ge 0) {
    $kx = $ef3.IndexOf('const requestTenantId = req.tenantId;', $ucBasi)
    $nx = $ef3.IndexOf('await HizliConnectService.sendInvoice(', $ucBasi)
    $siraDogru = ($kx -ge 0) -and ($nx -ge 0) -and ($kx -lt $nx)
  }

  # (b) TOCTOU dalinda yaniltici "gonderilmedi" DENMEMELI (belge gitmis olabilir).
  #     Metin yerine DAVRANIS olcutu: 409 + gercek belge kimliginin donulmesi.
  #     (Turkce literal karsilastirmasi dosya kodlamasina duyarli oldugu icin
  #     yalniz ASCII desenler kullanilir.)
  $toctouDurust = $ef3.Contains('res.status(409)')

  # (c) Yanit alanlari normalize ediliyor mu? (ham result.uuid okunmamali)
  $normalizeVar = $ef3.Contains('const sentData = result.data ?? {}') -and $ef3.Contains('sentUuid')

  # (d) Modal: eski sahte basari yolu YOK + gercek gonderim ucu CAGRILIYOR
  $modalYol = Join-Path $Root 'src\components\modules\edonusum\HizliInvoiceCreateModal.tsx'
  $modalVar = Test-Path $modalYol
  $sahteToast = $false
  $gercekCagri = $false
  if ($modalVar) {
    $md = [System.IO.File]::ReadAllText($modalYol)
    # Eski sahte yolun ASCII izi: basari metni `res.ettn` ile besleniyordu.
    $sahteToast = $md.Contains('res.ettn')
    $gercekCagri = $md.Contains('api.sendHizliInvoice(')
  }

  # (e) api.ts: createHizliModelInvoice artik sendToGib KABUL ETMEMELI
  $apiYol = Join-Path $Root 'src\services\api.ts'
  $sendToGibVar = $false
  if (Test-Path $apiYol) {
    $ap = [System.IO.File]::ReadAllText($apiYol)
    $sendToGibVar = $ap.Contains('sendToGib?: boolean')
  }

  $kusurlar2 = @()
  if (-not $siraDogru)     { $kusurlar2 += 'kiracı sahiplik kontrolu ag cagrisindan SONRA (veya yok)' }
  if (-not $toctouDurust)  { $kusurlar2 += 'TOCTOU dalinda 409 yerine yaniltici cevap' }
  if (-not $normalizeVar)  { $kusurlar2 += 'entegrator yanit alanlari normalize edilmiyor' }
  if (-not $modalVar)      { $kusurlar2 += 'HizliInvoiceCreateModal.tsx bulunamadi' }
  if ($sahteToast)         { $kusurlar2 += 'modalda sahte basari yolu (res.ettn) geri gelmis' }
  if ($modalVar -and -not $gercekCagri) { $kusurlar2 += 'modal gercek gonderim ucunu cagirmiyor' }
  if ($sendToGibVar)       { $kusurlar2 += 'createHizliModelInvoice hala sendToGib kabul ediyor' }

  if ($kusurlar2.Count -eq 0) {
    Add-Check "SEC-011 gonderim sonrasi dogru raporlama" 'PASS' `
      "sahiplik ag cagrisindan once; gercek alan adlari; modal yalniz gercek gonderimde basari diyor"
  } else {
    Add-Check "SEC-011 gonderim sonrasi dogru raporlama" 'FAIL' `
      ("KUSUR: " + ($kusurlar2 -join '; '))
  }
}

# SEC-012: Entegrator yapilandirmasi yoksa sessizce MOCK'a dusuluyor mu?
#
# 2026-09-12'de kapatilan KRITIK uydurma kapisi:
#   (a) `ProviderFactory.getProviderForTenant`, kiracinin `tenantEinvoiceSettings`
#       kaydi YOKSA kendiliginden ayar nesnesi uydurup `providerId: 'MOCK'`
#       yaziyordu; taninmayan providerId'de de `this.providers.get(k) || MOCK`
#       ile sessizce MOCK'a dusuyordu.
#   (b) MOCK saglayici `SENT_TO_GIB` ve GERCEK GIB kodu `1300` ("GIB'e iletildi")
#       donduruyordu; `getIncomingInvoices` uydurma tedarikci faturasi uretiyordu.
#   Sonuc: hic entegrator yapilandirmamis bir kiraci belge gonderdiginde belge
#   HICBIR YERE GITMEDEN `SENT` + `ACCEPTED` isaretleniyor, kontor dusuluyor ve
#   ERP faturasi "GIB onayli" gorunuyordu (CLAUDE.md md.1 ihlali).
#
# NOT: Asagidaki olcutler yalnizca DAVRANIS desenleridir (yorum satirlarindaki
# ayni kelimeleri yakalamamak icin atama kalibi kullanilir).
if (-not (Test-Path $pfYol)) {
  Add-Check "SEC-012 MOCK sessiz fallback kapali" 'BLOCKED' "server\services\providers\providerFactory.ts bulunamadi"
} elseif (-not (Test-Path $mpYol)) {
  Add-Check "SEC-012 MOCK sessiz fallback kapali" 'BLOCKED' "server\services\providers\mockProvider.ts bulunamadi"
} else {
  $pf = [System.IO.File]::ReadAllText($pfYol)
  $mp = [System.IO.File]::ReadAllText($mpYol)

  # (a) Fabrika fail-closed mi?
  #     Kalip KOD olarak aranir: literal `providerId: 'MOCK'` yalnizca eski
  #     uydurma yolda bulunur (yorum metinleri bu kalibi tasimaz).
  $pfHataSinifi   = $pf.Contains('class ProviderConfigurationError')
  $pfAyarsizHata  = $pf.Contains('throw new ProviderConfigurationError')
  $pfAyarUydurma  = $pf.Contains("providerId: 'MOCK'")           # eski uydurma ayar
  $pfSessizFallback = $pf.Contains('this.providers.get(provKey) ||')  # eski `|| MOCK`

  # (b) MOCK artik gercek GIB sonucu taklit etmiyor mu?
  $mpSahteGonderim = $mp.Contains("providerStatus: 'SENT_TO_GIB'")
  $mpSahteGibKodu  = $mp.Contains("gibStatusCode: '1300'")
  $mpBosGelenKutu  = $mp.Contains('return [];')
  $mpUydurmaTedarikci = $mp.Contains('supplierTitle:')

  # (c) Arayuz varsayilani MOCK degil mi? (ayar ucu)
  $st = ''
  if (Test-Path $stYol) { $st = [System.IO.File]::ReadAllText($stYol) }
  $stVarsayilanMock = $st.Contains("providerId = 'MOCK'")
  $stConfiguredYok  = $st.Contains('configured: false')

  # (d) Yapilandirma hatasi cagiranlarda AYRI handle ediliyor mu?
  $ed = ''
  if (Test-Path $edYol) { $ed = [System.IO.File]::ReadAllText($edYol) }
  $hd = ''
  if (Test-Path $hdYol) { $hd = [System.IO.File]::ReadAllText($hdYol) }
  $edConfigured503 = $ed.Contains('ProviderConfigurationError') -and $ed.Contains('configured: false')
  # Entegratore ULASILAMAMA de istemci kusurundan ayrilmali (502), yoksa ag
  # arizasi "belge gecersiz" (400) gibi raporlanir — izleme/retry yaniltilir.
  $edTasima502 = $ed.Contains('ProviderTransportError') -and $ed.Contains('res.status(502)')
  $hdConfigured503 = $hd.Contains('ProviderConfigurationError')
  # (e) `instanceof` yerine code tabanli kontrol (modul kopyasi farkina dayanikli)
  $pfIsYardimcisi = $pf.Contains('public static is(err: unknown)')
  $edIsKullanim = $ed.Contains('ProviderConfigurationError.is(')
  $hdIsKullanim = $hd.Contains('ProviderConfigurationError.is(')
  $tx = ''
  $txYol = Join-Path $Root 'server\routes\v1\taxpayers.ts'
  if (Test-Path $txYol) { $tx = [System.IO.File]::ReadAllText($txYol) }
  $txIsKullanim = $tx.Contains('ProviderConfigurationError.is(')

  # (f) TEST saglayicisinda kontor DUSULMEMELI ve kullanim olcumu yazilmamali.
  #     Aksi halde hicbir yere gonderilmeyen belge icin tahsilat uretilir.
  $edSvc = ''
  $edSvcYol = Join-Path $Root 'server\services\electronicDocumentService.ts'
  if (Test-Path $edSvcYol) { $edSvc = [System.IO.File]::ReadAllText($edSvcYol) }
  $qc = ''
  $qcYol = Join-Path $Root 'server\services\electronicDocumentQueue.ts'
  if (Test-Path $qcYol) { $qc = [System.IO.File]::ReadAllText($qcYol) }
  $testProviderKapisi = $qc.Contains('const isTestProvider =')
  $testRezervasyonAtla = $edSvc.Contains('const testProviderMi =')
  # Test saglayicisinda KONTOR DUSULMEMELI (commitCredits yok). Rollback YALNIZCA
  # kuyruklama aninda rezervasyon alinmissa yapilir (ayar belge beklerken
  # degismisse asili rezervasyon serbest birakilir) — bu yuzden "isTestProvider
  # blogunda rollback de olmasin" DENEMEZ; yalnizca commit aranmaz.
  # Kalip duz metin aramasi DEGIL: yorum satirlari ve makul mesafedeki bloklar
  # ayirt edilmeli (bkz. ayni dosyadaki 439-440 notu).
  $commitRezervasyonaBagli = [regex]::IsMatch($qc, '(?s)\} else if \(rezervasyonVar\) \{.{0,200}?commitCredits\(')
  $testDalindaCommit = [regex]::IsMatch($qc, '(?s)if \(isTestProvider\) \{.{0,400}?commitCredits\(')
  $testCommitYok = $commitRezervasyonaBagli -and -not $testDalindaCommit
  $testOlcumYok = $qc.Contains('if (!isTestProvider) {')
  # Hata yolunda da iade YALNIZCA rezervasyon alinmissa yapilmali. Kontrol
  # "varlik" degil YON olcmeli: `rezervasyonVar` pozitif anlamli oldugu icin
  # `if (rezervasyonVar) {` beklenir; ters cevrilmesi (`!rezervasyonVar`) FAIL'dir.
  $testHataIadeYok = $qc.Contains('if (rezervasyonVar) {') -and
                     [regex]::IsMatch($qc, '(?s)if \(rezervasyonVar\) \{.{0,300}?rollbackCredits\(') -and
                     -not [regex]::IsMatch($qc, '(?s)if \(!rezervasyonVar\) \{.{0,300}?rollbackCredits\(')

  # (g) 2026-09-12 ikinci tur — ayri bulunan bes uydurma/sessiz-gecis kaynagi:
  #
  #  1. `/api/edefter/*` yalnizca requireAuth tasiyordu; kimligi dogrulanmis
  #     HER kullanici (kasiyer/depo/personel) e-Defter uclarina erisebiliyordu.
  $hdRolKapisi = $hd.Contains("requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE')")
  #
  #  2. Entegrator ayar ucunda `environment` alani hic gonderilmezse sessizce
  #     'TEST' kabul ediliyor, denetim kaydina ise HAM (undefined) deger yaziliyordu.
  $stOrtamDogrulama = $st.Contains('rawEnvironment') -and $st.Contains('PRODUCTION')
  #
  #  3. Entegratör belge numarasi donmediginde ISBEY'in kendi UUID'si
  #     "entegratör belge no" olarak kaydediliyordu (iptal/durum sorgusu bu
  #     alani entegratöre gonderir -> yanlis belge hedeflenir).
  $ht = ''
  $htYol = Join-Path $Root 'server\services\providers\hizliTeknolojiProvider.ts'
  if (Test-Path $htYol) { $ht = [System.IO.File]::ReadAllText($htYol) }
  # Kalip ATAMA ifadesidir (duz `|| meta.uuid` DEGIL): dosyadaki aciklama
  # yorumu ayni diziyi metin olarak tasidigi icin duz arama sahte FAIL uretirdi
  # (bkz. ayni dosyadaki 439-440 notu).
  $docNoUydurmaSaglayici = $ht.Contains('providerDocumentId: res.data?.uuid || meta.uuid')
  $docNoUydurmaKuyruk    = $qc.Contains('sendResult.providerDocumentId || doc.uuid')
  #
  #  4. `processQueue()` hicbir yerden cagrilmiyordu: ilk denemesi basarisiz olan
  #     belge sonsuza kadar QUEUED kaliyor, kontör rezervasyonu asili kaliyordu.
  $ix = ''
  $ixYol = Join-Path $Root 'server\index.ts'
  if (Test-Path $ixYol) { $ix = [System.IO.File]::ReadAllText($ixYol) }
  $kuyrukCagrisiVar = $ix.Contains('ElectronicDocumentQueue.processQueue()')
  #
  #  5. `taxpayerCache` anahtari YALNIZCA VKN idi: kiracilar arasi paylasilan
  #     listede A kiracisinin sorgusu B kiracisina (unvan/alias dahil) servis
  #     ediliyordu. Kayit artik kiracı bazli anahtarla aranir.
  $txs = ''
  $txsYol = Join-Path $Root 'server\services\taxpayerService.ts'
  if (Test-Path $txsYol) { $txs = [System.IO.File]::ReadAllText($txsYol) }
  $txTkAnahtari = $txs.Contains('taxpayer-${tenantId}-${cleanId}') -and
                  $txs.Contains('c.id === cacheId') -and
                  $txs.Contains('findIndex(c => c.id === cacheId)')
  #  6. Ayni belgenin iki kez islenmesi (queueInvoice arka plan cagrisi +
  #     periyodik tur) entegratore CIFT belge gonderir.
  $ciftGonderimKorumasi = $qc.Contains('private static inFlight = new Set<string>();') -and $qc.Contains('if (this.inFlight.has(doc.id))')
  #  7. Kontor karari artik providerId'den TURETILMIYOR; kuyruklama aninda
  #     `creditsReserved` olarak kaydediliyor (fail-open turetme kapatildi).
  $kontorBayragi = $qc.Contains('const rezervasyonVar = doc.creditsReserved === true;') -and
                   $edSvc.Contains('creditsReserved: !testProviderMi')
  #
  #  8. 2026-09-13: MOCK saglayicisi ISBEY UUID'sinden TURETILMIS sahte bir
  #     "entegrator belge numarasi" donduruyordu. Bu alan iptal/durum sorgusunda
  #     entegratore GONDERILIR; sahte kimlikle sorgulamak yanlis belgeyi hedefler.
  #     Yasak olan TURETME ifadesidir; bolgede halen `meta.uuid` gecmesi normaldir
  #     (sendDespatch parametreyi iletir), bu yuzden kalip dar tutulur.
  $mockSahteBelgeNo = [regex]::IsMatch($mp, 'MOCK-DOC-')
  #
  #  9. 2026-09-13: Durum sorgusu `!res.success` durumunda da `{WAITING}` donuyordu.
  #     `HizliConnectService` ag/HTTP hatasinda HATA FIRLATMAZ, `{success:false}`
  #     doner — yani entegratore ULASILAMAMA, gecerli bir "belge henuz islenmedi"
  #     durumu gibi gosteriliyor ve HTTP 200 yaziliyordu. Arizayi gercek bekleyisten
  #     AYIRMAK icin: (a) saglayici basarisizlikta tasima hatasi firlatir,
  #     (b) basari donen ama GOVDESI BOS yanit durumu "UNKNOWN" olarak raporlanir.
  #
  #     KAPSAM ONEMLI: `if (!res.success)` ve `'UNKNOWN'` dizeleri ayni dosyada
  #     BASKA metotlarda da geciyor (getIncomingInvoices `!res.success`;
  #     gibStatusCode icin `|| 'UNKNOWN'`). Dosya genelinde aramak sahte PASS
  #     uretirdi. Bu yuzden kontrol YALNIZCA getInvoiceStatus GOVDESINE kapsanir.
  $gisBas = $ht.IndexOf('public async getInvoiceStatus(')
  $durumSorguAyrimi = $false
  if ($gisBas -ge 0) {
    $gisSonraki = $ht.IndexOf('public async getIncomingInvoices(', $gisBas)
    $gisGovde = if ($gisSonraki -gt $gisBas) { $ht.Substring($gisBas, $gisSonraki - $gisBas) } else { $ht.Substring($gisBas) }
    $durumSorguAyrimi = $gisGovde.Contains('if (!res.success)') -and
                        $gisGovde.Contains("providerStatus: 'UNKNOWN'") -and
                        $gisGovde.Contains('ProviderTransportError') -and
                        -not [regex]::IsMatch($gisGovde, "(?s)return \{\s*providerStatus: 'WAITING'")
  }
  # KAPSAM ONEMLI: `provider.providerId.toUpperCase() === 'MOCK'` deseni artik
  # BASKA bir soruyu yanitliyor ("gonderim gercekten yapildi mi?") ve dogrudur.
  # Yasak olan, KONTOR kararinin bu string'den TURETILMESI:
  #   const rezervasyonVar = String(doc.providerId || '').toUpperCase() !== 'MOCK';
  # Yalnizca bu turetme aranir.
  $kontorTuretmeKalmadi = -not [regex]::IsMatch($qc, 'rezervasyonVar\s*=\s*String\(doc\.providerId')
  # 10. 2026-09-13: FAZ 18 suiti BOLUM 4/5'te GERCEK ag cagrisi yapar. Onceden
  #     giden istekleri canli host'a karsi koruyan hicbir sey yoktu: adresler
  #     sabitten geliyordu ve sabit degisirse suit sessizce production'a dokunurdu.
  #     Suit artik her istegi `guvenliTestUrl(...)` suzgecinden gecirir. Bu,
  #     SEC-012'den AYRI bir sorudur ve kendi kaleminde (SEC-013) olculur.

  $kusurlar3 = @()
  if (-not $pfHataSinifi)   { $kusurlar3 += 'ProviderConfigurationError sinifi yok' }
  if (-not $pfAyarsizHata)  { $kusurlar3 += 'yapilandirmasiz kiracida hata firlatilmiyor' }
  if ($pfAyarUydurma)       { $kusurlar3 += 'fabrika hala providerId MOCK uyduruyor' }
  if ($pfSessizFallback)    { $kusurlar3 += 'taninmayan entegratorde sessiz MOCK fallback var' }
  if ($mpSahteGonderim)     { $kusurlar3 += 'MOCK hala SENT_TO_GIB donduruyor' }
  if ($mpSahteGibKodu)      { $kusurlar3 += 'MOCK hala gercek GIB kodu 1300 donduruyor' }
  if (-not $mpBosGelenKutu) { $kusurlar3 += 'MOCK gelen fatura uyduruyor (bos liste yok)' }
  if ($mpUydurmaTedarikci)  { $kusurlar3 += 'MOCK uydurma tedarikci faturasi uretiyor' }
  if ($stVarsayilanMock)    { $kusurlar3 += 'e-invoice ayar ucu varsayilani MOCK' }
  if (-not $stConfiguredYok) { $kusurlar3 += 'ayarsiz kiracida configured:false donulmuyor' }
  if (-not $edConfigured503) { $kusurlar3 += 'e-documents uclarinda yapilandirma hatasi ayrilmamis' }
  if (-not $edTasima502)     { $kusurlar3 += 'entegratore ulasilamama istemci kusurundan ayrilmamis (502 yok)' }
  if (-not $hdConfigured503) { $kusurlar3 += 'edefter ucunda yapilandirma hatasi ayrilmamis' }
  if (-not $pfIsYardimcisi) { $kusurlar3 += 'ProviderConfigurationError.is yardimcisi yok' }
  if (-not $edIsKullanim)   { $kusurlar3 += 'e-documents instanceof yerine is() kullanmiyor' }
  if (-not $hdIsKullanim)   { $kusurlar3 += 'edefter instanceof yerine is() kullanmiyor' }
  if (-not $txIsKullanim)   { $kusurlar3 += 'taxpayers instanceof yerine is() kullanmiyor' }
  if (-not $testProviderKapisi)  { $kusurlar3 += 'kuyrukta test saglayicisi kapisi yok' }
  if (-not $testRezervasyonAtla) { $kusurlar3 += 'test saglayicisinda kontor rezervasyonu atlanmiyor' }
  if (-not $testCommitYok)       { $kusurlar3 += 'test saglayicisi dalinda kontor islemi var (rezervasyon yok)' }
  if (-not $testOlcumYok)        { $kusurlar3 += 'test saglayicisinda kullanim olcumu yaziliyor' }
  if (-not $testHataIadeYok)     { $kusurlar3 += 'test saglayicisi hata yolunda kontor iadesi var (rezervasyon yok)' }
  if (-not $hdRolKapisi)         { $kusurlar3 += 'edefter uclarinda rol kapisi yok (yalniz requireAuth)' }
  if (-not $stOrtamDogrulama)    { $kusurlar3 += 'entegrator ayar ucunda ortam (TEST/PRODUCTION) dogrulanmiyor' }
  if ($docNoUydurmaSaglayici)    { $kusurlar3 += 'saglayici belge no yoksa ISBEY UUIDsi uyduruluyor (provider)' }
  if ($docNoUydurmaKuyruk)       { $kusurlar3 += 'saglayici belge no yoksa ISBEY UUIDsi uyduruluyor (kuyruk)' }
  if (-not $kuyrukCagrisiVar)    { $kusurlar3 += 'processQueue hicbir yerden cagrilmiyor (retry/rezervasyon asili kalir)' }
  if (-not $txTkAnahtari)        { $kusurlar3 += 'mukellef onbellegi kiracı bazli degil (kiracilar arasi PII sizmasi)' }
  if (-not $ciftGonderimKorumasi) { $kusurlar3 += 'ayni belgenin es zamanli cift islenmesine karsi koruma yok' }
  if (-not $kontorBayragi)        { $kusurlar3 += 'kontor rezervasyon karari kayda yazilmiyor (creditsReserved)' }
  if (-not $kontorTuretmeKalmadi) { $kusurlar3 += 'kontor karari hala providerId stringinden turetiliyor (fail-open)' }
  if ($mockSahteBelgeNo)          { $kusurlar3 += 'MOCK sahte entegrator belge numarasi uretiyor (MOCK-DOC-)' }
  if (-not $durumSorguAyrimi)     { $kusurlar3 += 'durum sorgusunda ulasilamama ile gercek bekleyis ayrilmamis (sessiz WAITING)' }

  if ($kusurlar3.Count -eq 0) {
    Add-Check "SEC-012 MOCK sessiz fallback kapali" 'PASS' `
      "yapilandirmasiz kiracida hata; MOCK gercek GIB sonucu taklit etmiyor; cagiranlar 503/configured:false donuyor"
  } else {
    Add-Check "SEC-012 MOCK sessiz fallback kapali" 'FAIL' `
      ("KUSUR: " + ($kusurlar3 -join '; '))
  }
}

# SEC-013: FAZ 18 suiti CANLI adrese istek atmasin (2026-09-13)
#
# FAZ 18 suiti BOLUM 4/5'te GERCEK ag cagrisi yapar (Version ping, UtilEncrypt,
# Login, MusteriGetir). Bu cagrilar YALNIZCA test ortamina cikmalidir; canli
# entegratore tek bir istek bile gitmemelidir (CLAUDE.md md.1 + kullanici
# talimati). Onceden bunu garanti eden hicbir sey yoktu: adresler sabitten
# geliyordu, sabit degisirse suit sessizce uretime dokunurdu.
#
# Bu kalem "suzgec VAR MI" ile yetinmez; suzgecin HER istekte KULLANILDIGINI
# olcer. Olcut KONUM tabanlidir: `axios.<metot>(` cagrisinin argumani dogrudan
# `guvenliTestUrl(` olmalidir. Yalnizca "suzgec kac kez geciyor" saymak zayif
# olurdu — olu bir `guvenliTestUrl(x)` cagrisi sayiyi doldurup suzgecsiz bir
# `axios.get(x)` satirini gizleyebilirdi. Konum tabanli kalip bu bosluğu kapatir.
#
# NOT: Bu dosya `tsconfig.server.json` kapsami DISINDADIR (exclude: server/tests),
# yani sozdizimi hatasi tsc'ye yakalanmaz; ancak FAZ 18 kalemi suiti fiilen
# kosturdugu icin sozdizimi hatasi kosuyu dusurur ve kalem BLOCKED'a iner.
$f18Yol = Join-Path $Root 'server\tests\phase18HizliBilisimIntegrationTest.ts'
if (-not (Test-Path $f18Yol)) {
  Add-Check "SEC-013 FAZ18 canli adres korumasi" 'BLOCKED' "server\tests\phase18HizliBilisimIntegrationTest.ts bulunamadi"
} else {
  $f18 = [System.IO.File]::ReadAllText($f18Yol)
  # Yalnizca KOD satirlari: satir yorumlari ve blok yorumlari ayiklanir; aksi
  # halde dosyadaki aciklama metni sayilir ve sahte sonuc uretir.
  $f18Kod = ($f18 -split "`n" | Where-Object { $_ -notmatch '^\s*//' }) -join "`n"
  $f18Kod = [regex]::Replace($f18Kod, '(?s)/\*.*?\*/', '')

  $f18SuzgecTanim  = $f18Kod.Contains('function guvenliTestUrl(')
  # TOPLAM istek sayisi ve KORUNAN istek sayisi AYRI olculur. Onceden burada
  # "guvenliTestUrl( gecen yer sayisi" ile "axios cagri sayisi" karsilastiriliyordu;
  # bu, sarmalamanin KONUMUNU olcmedigi icin zayiftir: `const u = guvenliTestUrl(x)`
  # gibi olu bir cagri sayiyi doldurup, suzgecsiz `axios.get(x)` satirini gizleyebilir.
  $f18IstekSayisi  = ([regex]::Matches($f18Kod, 'axios\.(get|post|put|delete)\(')).Count
  # Sarmalanmis istek: axios cagrisinin ARGUMANI dogrudan suzgec olmali. `\s`
  # varsayilan modda satir sonunu da kapsadigi icin argumani alt satirda yazilan
  # cagrilar da yakalanir (dosyadaki 4 cagrinin hepsi boyle).
  $f18SarmaliIstek = ([regex]::Matches($f18Kod, 'axios\.(get|post|put|delete)\(\s*guvenliTestUrl\(')).Count
  $f18SuzgecsizIstek = $f18IstekSayisi - $f18SarmaliIstek
  # 11. Bolumdaki "canliya gonderilmedi" iddialari artik kosulsuz pass() DEGIL,
  # olcume bagli olmalidir. Bu iddia KODDA olmali (yorumda degil): hem olcum
  # kapisi (`=== 0`) hem sayaci artiran koruma (`++`) birlikte aranir.
  $f18OlcumeBagli = $f18Kod.Contains('canliAdresEngeli === 0') -and $f18Kod.Contains('canliAdresEngeli++')
  # Belge gonderen/iptal eden uca cagri YOK (kontor yakilmaz).
  $f18BelgeCagrisiYok = -not ([regex]::IsMatch($f18Kod, 'axios\.\w+\(\s*[^)]*RestApi/(SendDocument|CancelDocument)'))

  $f18Eksikler = @()
  if (-not $f18SuzgecTanim)            { $f18Eksikler += 'guvenliTestUrl suzgeci tanimli degil' }
  if ($f18IstekSayisi -eq 0)           { $f18Eksikler += 'suitte hic istek yok (olculecek sey yok)' }
  if ($f18SuzgecsizIstek -gt 0)        { $f18Eksikler += "suzgecsiz istek var (istek=$f18IstekSayisi sarmali=$f18SarmaliIstek)" }
  if (-not $f18OlcumeBagli)            { $f18Eksikler += 'canliya gonderilmedi iddialari olcume bagli degil' }
  if (-not $f18BelgeCagrisiYok)        { $f18Eksikler += 'suit belge gonderen/iptal eden uca cagri yapiyor' }

  if ($f18Eksikler.Count -eq 0) {
    Add-Check "SEC-013 FAZ18 canli adres korumasi" 'PASS' `
      ("tum giden istekler suzgecleniyor (istek={0}, sarmali={1}); canliya gonderilmedi iddialari olcume bagli" -f $f18IstekSayisi, $f18SarmaliIstek)
  } else {
    Add-Check "SEC-013 FAZ18 canli adres korumasi" 'FAIL' `
      ("KUSUR: " + ($f18Eksikler -join '; '))
  }
}

# SEC-014: e-Donusum ortami (environment) kiracı tarafindan canliya cevrilebilir mi?
#
# 2026-09-13 BULGU (production kacagi): PUT /api/v1/e-invoice/settings,
# `environment='PRODUCTION'` istegini HICBIR kilit olmadan kaydediyordu. Bu ayar
# TUM e-Donusum yiginini yonlendirir:
#   - ProviderFactory.getProviderForTenant -> settings.environment okunur
#   - hizliTeknolojiProvider: `const isTest = settings.environment !== 'PRODUCTION'`
#   - hizli-defter.ts base URL secimi ayni ayardan turer
# Yani kiracının kendi ayarini canliya cevirmesi, e-Belge/e-Defter cagrilarini
# econnect.hizliteknoloji.com.tr'ye yonlendirirdi. efatura.ts'teki fail-closed
# kilit (HIZLI_BILISIM_ALLOW_PROD) bu ucta YOKTU -> CLAUDE.md md.1 ihlali.
#
# Olcut: production ortami istegini kabul EDEN yolda HIZLI_BILISIM_ALLOW_PROD
# onay degiskeni bulunmak zorundadir.
$eiYol = Join-Path $Root 'server\routes\v1\e-invoice-settings.ts'
if (-not (Test-Path $eiYol)) {
  Add-Check "SEC-014 e-Donusum canli ortam kilidi" 'BLOCKED' "server\routes\v1\e-invoice-settings.ts bulunamadi"
} else {
  $ei = [System.IO.File]::ReadAllText($eiYol)

  # (a) Ortam degerini PRODUCTION'a ceviren kabul yolu var mi?
  $eiProdKabul = $ei.Contains("rawEnvironment === 'PRODUCTION'")
  # (b) Bu yol onay degiskeniyle kilitli mi?
  $eiKilitVar  = $ei.Contains("HIZLI_BILISIM_ALLOW_PROD")

  $eiEksikler = @()
  if (-not $eiProdKabul) { $eiEksikler += 'ortam dogrulamasi bulunamadi (kalem bayatladi)' }
  if (-not $eiKilitVar)  { $eiEksikler += 'PRODUCTION ortami onay degiskeni olmadan kabul ediliyor (canli kacak)' }

  if ($eiEksikler.Count -eq 0) {
    Add-Check "SEC-014 e-Donusum canli ortam kilidi" 'PASS' `
      "environment=PRODUCTION yalniz HIZLI_BILISIM_ALLOW_PROD=true iken kabul ediliyor (kiracı ortami canliya ceviremez)"
  } else {
    Add-Check "SEC-014 e-Donusum canli ortam kilidi" 'FAIL' `
      ("KUSUR: " + ($eiEksikler -join '; '))
  }
}

# npm run build = "tsc -b && vite build" (frontend). Sunucu dahil DEGILDIR.
# Cikti cok uzun olabildigi icin yalnizca SON birkac satir rapora alinir.
$o2 = Join-Path $Tmp 'cikti-npm-build.txt'
$e2 = Join-Path $Tmp 'hata-npm-build.txt'
$npmModVar = Test-Path (Join-Path $Root 'node_modules')
if (-not $npmModVar) {
  Add-Check "BUILD npm run build (tsc -b && vite build)" 'BLOCKED' "node_modules yok - once 'npm install' calistirin"
} else {
  $npmExe = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
  if (-not $npmExe) {
    Add-Check "BUILD npm run build (tsc -b && vite build)" 'BLOCKED' "npm.cmd PATH'te bulunamadi"
  } else {
    $sw2 = [System.Diagnostics.Stopwatch]::StartNew()
    $pr2 = Start-Process -FilePath $npmExe.Source -ArgumentList @('run', 'build') `
             -WorkingDirectory $Root -PassThru -WindowStyle Hidden `
             -RedirectStandardOutput $o2 -RedirectStandardError $e2
    $pr2 | Wait-Process -Timeout 900 -ErrorAction SilentlyContinue
    if (-not $pr2.HasExited) { try { $pr2 | Stop-Process -Force } catch { } }
    # ExitCode'un kesinlesmesi icin Refresh gerekir (bkz. Invoke-Suite notu).
    try { $pr2.Refresh() } catch { }
    $sw2.Stop()
    $exit2 = if ($null -ne $pr2.ExitCode) { $pr2.ExitCode } else { -1 }

    $ham2 = ''
    foreach ($f in @($e2, $o2)) {
      if (Test-Path $f) { $ham2 += (Get-Content $f -Raw -Encoding UTF8 -ErrorAction SilentlyContinue) }
    }
    $ham2 = [string]$ham2
    $buildHata = ([regex]::Matches($ham2, 'error TS\d+')).Count
    $sonSatirlar = @()
    if ((Test-Path $o2)) {
      $sonSatirlar = @(Get-Content $o2 -Encoding UTF8 -Tail 6 -ErrorAction SilentlyContinue)
    }
    $ozet = ($sonSatirlar -join ' | ')
    if ($ozet.Length -gt 400) { $ozet = $ozet.Substring($ozet.Length - 400) }

    if ($exit2 -eq 0) {
      Add-Check "BUILD npm run build (tsc -b && vite build)" 'PASS' `
        ("exit=0, TS hatasi=0 ({0:N1} sn). Son satirlar: {1}" -f $sw2.Elapsed.TotalSeconds, $ozet)
    } else {
      Add-Check "BUILD npm run build (tsc -b && vite build)" 'FAIL' `
        ("exit=$exit2, TS hatasi=$buildHata ({0:N1} sn). Son satirlar: {1}" -f $sw2.Elapsed.TotalSeconds, $ozet)
    }
  }
}

# ---------------------------------------------------------------- yedek
Bolum "1. VERITABANI YEDEGI (geri donus icin)"
$DbPath = Join-Path $Root 'data\database.json'
if ($NoBackup) {
  Add-Check "database.json yedegi" 'SKIP' "-NoBackup verildi"
} elseif (Test-Path $DbPath) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $bk = Join-Path $Tmp ("database.once-$stamp.json")
  Copy-Item $DbPath $bk -Force
  Add-Check "database.json yedegi" 'PASS' ("{0} ({1:N1} KB)" -f (Split-Path -Leaf $bk), ((Get-Item $bk).Length / 1KB))
} else {
  Add-Check "database.json bulundu" 'WARN' "data\database.json yok - ilk calistirmada seed uretilecek"
}

# ---------------------------------------------------------------- yardimcilar

# ── Calistirma yolu secimi ───────────────────────────────────────────────────
# Tercih: "node --import tsx" (node.exe dogrudan; cmd.exe tirmak kurallari devre disi).
# Yedek : cmd.exe /c "npx.cmd --yes tsx" (npx .cmd oldugu icin tirmak riskli ama calisir).
# $script:NodeTsxModu degeri bolum 0'da (probe) belirlenir.

function Start-Surec {
  param([string[]]$Argumanlar, [string]$OutDosya, [string]$ErrDosya)
  # Uc yol, guvenilirlik sirasiyla:
  #   1) node --import tsx      (node.exe dogrudan)
  #   2) node <tsx-cli> ...     (tsx CLI'yi node ile cagir — .cmd tirmak riski yok)
  #   3) cmd /c npx --yes tsx   (son care)
  # NOT: $args PowerShell'in otomatik degiskenidir — kullanilmaz.
  if ($script:NodeTsxModu) {
    $exe = $Node; $argListesi = @('--import', 'tsx') + $Argumanlar
  } elseif ($script:TsxCliModu) {
    $exe = $Node; $argListesi = @('node_modules/tsx/dist/cli.mjs') + $Argumanlar
  } else {
    $exe = $env:ComSpec
    $argListesi = @('/c', "`"$Npx`" --yes tsx " + ($Argumanlar -join ' '))
  }
  return Start-Process -FilePath $exe -ArgumentList $argListesi `
           -WorkingDirectory $Root -PassThru -WindowStyle Hidden `
           -RedirectStandardOutput $OutDosya -RedirectStandardError $ErrDosya
}

function Invoke-Suite {
  param(
    [string]$Etiket,
    [string]$Script,          # repo kokune gore yol
    [string[]]$ExtraArgs = @(),
    [ValidateSet('PASSFAIL','PASSFAILSKIP','MUTABAKAT','KONTROL','HIZLI','YOK')][string]$Tip = 'PASSFAIL',
    [int]$ZamanAsimi = 300,
    [string]$BasariliDesen = ''
  )
  $safe = ($Etiket -replace '[^A-Za-z0-9._-]', '_')
  $outFile = Join-Path $Tmp ("cikti-$safe.txt")
  $rawOut = Join-Path $Tmp ("raw-$safe-out.txt")
  $rawErr = Join-Path $Tmp ("raw-$safe-err.txt")
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $lines = @()
  $code = -1
  $zamanAsimiOldu = $false

  # Gercek zaman asimi: cocuk surec WaitForExit(ms) ile beklenir; takilirsa oldurulur.
  $argumanlar = @($Script)
  if ($ExtraArgs -and $ExtraArgs.Count -gt 0) { $argumanlar += $ExtraArgs }
  try {
    $proc = Start-Surec -Argumanlar $argumanlar -OutDosya $rawOut -ErrDosya $rawErr
    $bitti = $proc.WaitForExit($ZamanAsimi * 1000)
    if (-not $bitti) {
      $zamanAsimiOldu = $true
      try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }
      Start-Sleep -Milliseconds 700
      $code = -9
    } else {
      # ExitCode'un kesinlesmesi icin parametresiz WaitForExit + Refresh gerekir
      # (onceki surumde exit degeri bos donuyordu ve 'YOK' tipi yanlis FAIL uretiyordu).
      try { $proc.WaitForExit() } catch { }
      try { $proc.Refresh() } catch { }
      try { $code = $proc.ExitCode } catch { $code = $null }
    }
  } catch {
    $lines += ("SCRIPT CALISTIRILAMADI: " + $_.Exception.Message)
    $code = -1
  }
  if (Test-Path $rawOut) { $lines += (Get-Content $rawOut -Encoding UTF8) }
  if (Test-Path $rawErr) { $lines += (Get-Content $rawErr -Encoding UTF8) }
  $sw.Stop()
  $lines | Set-Content -Path $outFile -Encoding UTF8
  $text = ($lines -join "`n")
  if ($zamanAsimiOldu) { $text += "`n[SCRIPT] ZAMAN ASIMI: $ZamanAsimi sn asildi - surec olduruldu." }

  $detay = ""
  $durum = 'FAIL'
  $p = $null; $f = $null; $s = $null

  switch ($Tip) {
    'PASSFAIL' {
      $m = [regex]::Matches($text, 'PASS:\s*(\d+)\s*\|\s*[^\d\s]*\s*FAIL:\s*(\d+)')
      if ($m.Count -eq 0) { $m = [regex]::Matches($text, '(\d+)\s*PASS\s*/\s*(\d+)\s*FAIL') }
      if ($m.Count -gt 0) {
        $last = $m[$m.Count - 1]
        if ($last.Groups.Count -eq 3 -and $last.Groups[1].Value -ne '') {
          # iki desen de 2 grup doner: (pass, fail)
          $p = [int]$last.Groups[1].Value; $f = [int]$last.Groups[2].Value
        }
      }
      if ($p -ne $null) {
        $durum = if ($f -eq 0 -and $p -gt 0) { 'PASS' } else { 'FAIL' }
        $detay = "PASS=$p FAIL=$f  ({0:N1} sn, exit=$code)" -f $sw.Elapsed.TotalSeconds
      } else {
        $detay = "ozet satiri okunamadi (exit=$code) - ham cikti: cikti-$safe.txt"
      }
    }
    'PASSFAILSKIP' {
      $m = [regex]::Matches($text, 'PASS:\s*(\d+)\b.*?FAIL:\s*(\d+)\b.*?SKIP:\s*(\d+)')
      if ($m.Count -eq 0) {
        $m = [regex]::Matches($text, '(\d+)\s*PASS\s*/\s*(\d+)\s*FAIL\s*/\s*(\d+)\s*SKIP')
      }
      if ($m.Count -gt 0) {
        $last = $m[$m.Count - 1]
        $p = [int]$last.Groups[1].Value; $f = [int]$last.Groups[2].Value; $s = [int]$last.Groups[3].Value
        $durum = if ($f -eq 0) { 'PASS' } else { 'FAIL' }
        $detay = "PASS=$p FAIL=$f SKIP=$s  ({0:N1} sn, exit=$code)" -f $sw.Elapsed.TotalSeconds
      } else {
        $detay = "ozet satiri okunamadi (exit=$code) - ham cikti: cikti-$safe.txt"
      }
    }
    'MUTABAKAT' {
      # Iki ozet bicimi de desteklenir:
      #   (a) "31 PASS / 0 FAIL"                -> faz252a / faz252b / faz252c
      #   (b) "... test | PASS: 45 | FAIL: 0"   -> faz25IzolasyonTest
      $m = [regex]::Matches($text, '(\d+)\s*PASS\s*/\s*(\d+)\s*FAIL')
      if ($m.Count -eq 0) { $m = [regex]::Matches($text, 'PASS:\s*(\d+)\s*\|\s*[^\d\s]*\s*FAIL:\s*(\d+)') }
      if ($m.Count -gt 0) {
        $last = $m[$m.Count - 1]
        $p = [int]$last.Groups[1].Value; $f = [int]$last.Groups[2].Value
        $durum = if ($f -eq 0 -and $p -gt 0) { 'PASS' } else { 'FAIL' }
        $detay = "PASS=$p FAIL=$f  ({0:N1} sn, exit=$code)" -f $sw.Elapsed.TotalSeconds
      } else {
        $detay = "ozet satiri okunamadi (exit=$code) - ham cikti: cikti-$safe.txt"
      }
    }
    'KONTROL' {
      # Muhasebe kontrol tablosu: satir sonlari [PASS] / [FAIL]
      $p = ([regex]::Matches($text, '\[PASS\]')).Count
      $f = ([regex]::Matches($text, '\[FAIL\]')).Count
      if ($p + $f -gt 0) {
        $durum = if ($f -eq 0) { 'PASS' } else { 'FAIL' }
        $detay = "Kontrol noktasi: $p PASS / $f FAIL  ({0:N1} sn, exit=$code)" -f $sw.Elapsed.TotalSeconds
      } else {
        $detay = "kontrol tablosu okunamadi (exit=$code) - ham cikti: cikti-$safe.txt"
      }
    }
    'HIZLI' {
      # FAZ 18 (Hızlı Bilişim) özel biçimi — bkz. Get-HizliSonuc açıklaması.
      # KARAR MANTIĞI (dürüstlük kuralı):
      #   FAIL > 0                         -> FAIL
      #   PASS = 0 (hiç kanıt yok)         -> BLOCKED  (geçti sayılmaz)
      #   FAIL = 0, WARN > 0               -> WARN     (tam yeşil denemez)
      #   FAIL = 0, WARN = 0, SKIP > 0     -> BLOCKED  (kanıtlanamayan adım var)
      #   FAIL = 0, WARN = 0, SKIP = 0     -> PASS
      # Özet satırı okunamazsa -> BLOCKED (sessiz PASS yok).
      #
      # 2026-09-15 DUZELTMESI — SKIP'in yok sayilmasi kusuru:
      #   Onceki surumde karar yalnizca FAIL/PASS/WARN'e bakiyordu; SKIP hic
      #   okunmuyordu. FAZ 18 suiti 2026-09-15'te "kanitlanamayan adim" (egress
      #   engeli, DNS yoklugu) durumlarini artik WARN degil SKIP olarak
      #   raporluyor. Bu degisiklikle birlikte eski mantik SU KUSURU uretiyordu:
      #   WARN=0 + SKIP=3 -> PASS. Yani UtilEncrypt -> Login zinciri HIC
      #   dogrulanmamisken kalem PASS gorunuyor, asagidaki kapanis kapisi da
      #   "FAZ 18 durumu PASS" kosulunu saglanmis sayip canli belge kapisini
      #   acmaya yaklasiyordu. Kanitlanmamis bir adimi PASS gostermek
      #   CLAUDE.md md.1'in acik ihlalidir.
      #   SKIP = "bu kosuda kanitlanamadi" oldugu icin dogru etiket BLOCKED'tir
      #   (bkz. scriptin kendi aciklamasi: BLOCKED = ortam nedeniyle kosulamadi).
      $hs = Get-HizliSonuc -Metin $text
      $p = $hs.PASS; $f = $hs.FAIL; $w = $hs.WARN; $s = $hs.SKIP
      if ($null -eq $p -or $null -eq $f) {
        $durum = 'BLOCKED'
        $detay = "FAZ 18 ozet satiri okunamadi (exit=$code) - ham cikti: cikti-$safe.txt"
      } elseif ($f -gt 0) {
        $durum = 'FAIL'
        $detay = "PASS=$p FAIL=$f WARN=$w SKIP=$s  ({0:N1} sn, exit=$code) - basarisiz Hizli Bilisim testi var" -f $sw.Elapsed.TotalSeconds
      } elseif ($p -eq 0) {
        $durum = 'BLOCKED'
        $detay = "PASS=0 FAIL=$f WARN=$w SKIP=$s  ({0:N1} sn, exit=$code) - HIC kanit uretilmedi (credential eksik veya test modu kapali olabilir)" -f $sw.Elapsed.TotalSeconds
      } elseif ($w -gt 0) {
        $durum = 'WARN'
        $detay = "PASS=$p FAIL=0 WARN=$w SKIP=$s  ({0:N1} sn, exit=$code) - uyarilar production oncesi incelenmeli" -f $sw.Elapsed.TotalSeconds
      } elseif ($null -ne $s -and $s -gt 0) {
        # Kanitlanamayan adim var: PASS DEGIL, ama FAIL de degil (ortam/erisim).
        $durum = 'BLOCKED'
        $detay = "PASS=$p FAIL=0 WARN=0 SKIP=$s  ({0:N1} sn, exit=$code) - $s adim KANITLANAMADI (PASS sayilmaz)" -f $sw.Elapsed.TotalSeconds
        # Hangi adimin kanitlanamadigi raporda gorunsun (sessiz BLOCKED yok).
        foreach ($satir in ($text -split "`n")) {
          if ($satir -match 'KANITLANAMADI|Auth Akisi') { $detay += ("`n            " + $satir.Trim()) }
        }
      } else {
        $durum = 'PASS'
        $detay = "PASS=$p FAIL=0 WARN=0 SKIP=$s  ({0:N1} sn, exit=$code)" -f $sw.Elapsed.TotalSeconds
      }
      # Test modu kapalıysa canlı auth testi atlanır — bu AÇIKÇA raporlanır.
      if ($text -match 'CANLI sistem|IS_TEST_MODE=false|Test Modu\s*:\s*DEVRE') {
        $detay += "`n            DIKKAT: test modu KAPALI gorunuyor - canli auth kaniti uretilmemis olabilir."
      }
      if ($text -match 'CANLI BELGE GONDERILMEDI|CANLI BELGE GÖNDERİLMEDİ') {
        $detay += "`n            NOT: bu kosuda canli belge GONDERILMEDI (kontor yakilmadi) - kural korundu."
      }
    }
    'YOK' {
      # Yalnizca exit kodu ile karar verilir; ancak bazi ortamlarda Start-Process
      # exit kodu okunamaz. Bu durumda cikti icindeki BASARI ISARETI aranir ve
      # karar "ciktiya dayali" olarak ACIKCA etiketlenir (sessiz varsayim yok).
      $exitBos = ($null -eq $code) -or ("$code" -eq '')
      if (-not $exitBos -and $code -eq 0) {
        $durum = 'PASS'
        $detay = "exit=0  ({0:N1} sn)" -f $sw.Elapsed.TotalSeconds
      } elseif ($exitBos -and $BasariliDesen -and ($text -match $BasariliDesen) -and ($text -notmatch '(?m)^\s*(Error|HATA|Unhandled)')) {
        $durum = 'PASS'
        $detay = ("exit kodu okunamadi; karar CIKTIYA DAYALI: basari isareti bulundu  ({0:N1} sn)" -f $sw.Elapsed.TotalSeconds)
      } else {
        $durum = 'FAIL'
        $detay = if ($exitBos) { "exit kodu okunamadi ve ciktida basari isareti yok  ({0:N1} sn)" -f $sw.Elapsed.TotalSeconds }
                 else { "exit=$code  ({0:N1} sn)" -f $sw.Elapsed.TotalSeconds }
      }
    }
  }

  # zaman asimi her seyi gecersiz kilar (kismi cikti PASS sayilmaz)
  if ($zamanAsimiOldu) {
    $durum = 'FAIL'
    $detay = "ZAMAN ASIMI ($ZamanAsimi sn) - suite takildi, surec olduruldu. Kismi cikti: cikti-$safe.txt"
  }

  # hata izini: cikti icinde supheli desenler
  if ($durum -eq 'FAIL') {
    $izler = @()
    foreach ($pat in @('Error:', 'error TS', 'Cannot find module', 'SyntaxError', 'EADDRINUSE', 'ECONNREFUSED', 'Unhandled', 'not a function')) {
      $hit = ($lines | Select-String -SimpleMatch $pat | Select-Object -First 1)
      if ($hit) { $izler += ("{0} -> {1}" -f $pat, $hit.Line.Trim()) }
    }
    if ($izler.Count -gt 0) { $detay += "`n            IZ: " + ($izler -join "`n            IZ: ") }
  }

  Add-Check $Etiket $durum $detay ("cikti-$safe.txt")
  return [pscustomobject]@{ Durum = $durum; PASS = $p; FAIL = $f; SKIP = $s; Exit = $code; Ham = $text; Dosya = $outFile }
}

# 2026-09-12: FAZ 18 (Hızlı Bilişim entegrasyon testi) özet biçimi diğerlerinden
# farklıdır ve WARN üretir: "✅ PASS : 12" / "❌ FAIL : 1" / "⚠️ WARN : 3" /
# "⏭️ SKIP : 4" satırları. Ayrı bir değerlendirme GEREKTİRİR çünkü:
#   - WARN varsa "tam yeşil" DENEMEZ (uyarılar production öncesi incelenmeli).
#   - Test modu kapalıysa canlı auth testi SKIP olur -> bu bir GEÇİŞ değildir,
#     "kanıt üretilemedi" demektir; FAIL gibi de gösterilmemelidir.
#   - Sandbox testi bu aşamada CANLI BELGE GÖNDERMEZ (kontör yakmaz) — kural korunur.
function Get-HizliSonuc {
  param([string]$Metin)
  $p = ([regex]::Match($Metin, "PASS\s*:\s*(\d+)")).Groups[1].Value
  $f = ([regex]::Match($Metin, "FAIL\s*:\s*(\d+)")).Groups[1].Value
  $w = ([regex]::Match($Metin, "WARN\s*:\s*(\d+)")).Groups[1].Value
  $s = ([regex]::Match($Metin, "SKIP\s*:\s*(\d+)")).Groups[1].Value
  return [pscustomobject]@{
    PASS = if ($p) { [int]$p } else { $null }
    FAIL = if ($f) { [int]$f } else { $null }
    WARN = if ($w) { [int]$w } else { $null }
    SKIP = if ($s) { [int]$s } else { $null }
  }
}

function Test-Saglik { param([string]$Url)
  try {
    $r = Invoke-WebRequest -Uri "$Url/api/health" -TimeoutSec 4 -UseBasicParsing
    return ([int]$r.StatusCode -eq 200)
  } catch { return $false }
}

function Start-DogrulamaSunucusu {
  param([string]$Ad, [int]$ZamanAsimiSn = 60)
  $so = Join-Path $Tmp "sunucu-$Ad-out.log"
  $se = Join-Path $Tmp "sunucu-$Ad-err.log"
  $proc = Start-Surec -Argumanlar @('server/index.ts') -OutDosya $so -ErrDosya $se
  $baslangic = Get-Date
  while (((Get-Date) - $baslangic).TotalSeconds -lt $ZamanAsimiSn) {
    if (Test-Saglik $Base) {
      # Saglik yanit veriyor ama BIZIM baslattigimiz surec olduyse -> portu baska bir sunucu tutuyor
      Start-Sleep -Milliseconds 400
      $harici = $proc.HasExited
      return [pscustomobject]@{ Proc = $proc; Ok = $true; Harici = $harici; Out = $so; Err = $se }
    }
    if ($proc.HasExited) { break }
    Start-Sleep -Milliseconds 700
  }
  return [pscustomobject]@{ Proc = $proc; Ok = $false; Harici = $false; Out = $so; Err = $se }
}

function Stop-DogrulamaSunucusu { param($Oturum)
  if ($Oturum -and $Oturum.Proc -and -not $Oturum.Proc.HasExited) {
    try { Stop-Process -Id $Oturum.Proc.Id -Force -ErrorAction SilentlyContinue } catch { }
    Start-Sleep -Milliseconds 900
  }
}

function Invoke-Kod {
  param([string]$Method, [string]$Url, $Body = $null, [string]$Token = '', [int]$ZamanAsimi = 10, [hashtable]$EkBaslik = @{})
  $h = @{}
  if ($Token) { $h['Authorization'] = "Bearer $Token" }
  foreach ($k in $EkBaslik.Keys) { $h[$k] = $EkBaslik[$k] }
  try {
    if ($null -ne $Body) {
      $json = if ($Body -is [string]) { $Body } else { ($Body | ConvertTo-Json -Compress) }
      $r = Invoke-WebRequest -Uri $Url -Method $Method -Body $json -ContentType 'application/json' -Headers $h -TimeoutSec $ZamanAsimi -UseBasicParsing
    } else {
      $r = Invoke-WebRequest -Uri $Url -Method $Method -Headers $h -TimeoutSec $ZamanAsimi -UseBasicParsing
    }
    return [pscustomobject]@{ Kod = [int]$r.StatusCode; Icerik = $r.Content; Basliklar = $r.Headers }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $kod = 0
      try { $kod = [int]$resp.StatusCode } catch { $kod = -1 }
      $ic = ''
      try {
        $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $ic = $sr.ReadToEnd()
      } catch { }
      return [pscustomobject]@{ Kod = $kod; Icerik = $ic; Basliklar = $resp.Headers }
    }
    return [pscustomobject]@{ Kod = 0; Icerik = ("AG HATASI: " + $_.Exception.Message); Basliklar = $null }
  }
}

# =================================================================
# FAZ A - TAZE SUNUCU #1: yalnizca LOGIN RATE LIMIT kaniti
# =================================================================
if (-not $SkipRateLimit) {
  Bolum "2. FAZ 25.4 #3a - LOGIN RATE LIMIT (taze sunucu #1)"

  if (Test-Saglik $Base) {
    Add-Check "Taze sunucu #1" 'BLOCKED' "Port $Port'ta ZATEN bir sunucu calisiyor. Rate-limit kaniti icin once onu durdurun (npm run dev varsa Ctrl+C), sonra scripti tekrar calistirin."
  } else {
    $s1 = Start-DogrulamaSunucusu -Ad 'rlimit'
    if (-not $s1.Ok) {
      Add-Check "Sunucu #1 basladi" 'BLOCKED' "Sunucu ayaga kalkmadi. Log: sunucu-rlimit-err.log`n            ILK SATIRLAR: " + (((Get-Content $s1.Err -Encoding UTF8 -ErrorAction SilentlyContinue | Select-Object -First 5) -join ' | '))
      Add-Check "SEC-004 login rate limit (20/15dk)" 'BLOCKED' "sunucu yok"
    } else {
      Add-Check "Sunucu #1 basladi" ($(if ($s1.Harici) { 'WARN' } else { 'PASS' })) ($(if ($s1.Harici) { "Portu baska bir surec tutuyor - rate-limit butcesi TAZE DEGIL (kanit zayiflar)" } else { "PID {0}  log: sunucu-rlimit-out.log" -f $s1.Proc.Id }))

      # login'e dogru olmayan kimlikle 21 istek (401 beklenir, 21.si 429)
      # NOT: Bu dizi XFF BASLIGI GONDERMEZ -> limiter'in "calistigini" gosterir ama
      # "bypass kapali mi" sorusunu YANITLAMAZ (asagidaki RATE-003'e bakin).
      $kodlar = @()
      for ($i = 1; $i -le 21; $i++) {
        $r = Invoke-Kod -Method 'POST' -Url "$Base/api/auth/login" -Body @{ username = 'dogrulama-yok'; password = 'dogrulama-yok' }
        $kodlar += $r.Kod
      }
      $s429 = ($kodlar | Where-Object { $_ -eq 429 }).Count
      $s401 = ($kodlar | Where-Object { $_ -eq 401 }).Count
      $ilk429 = -1
      for ($i = 0; $i -lt $kodlar.Count; $i++) { if ($kodlar[$i] -eq 429) { $ilk429 = $i + 1; break } }
      $dizi = ($kodlar -join ' ')

      if ($s429 -ge 1 -and $s401 -ge 1) {
        Add-Check "RATE-001 login: 429 uretildi" 'PASS' ("21 istek -> 401 x $s401, 429 x $s429; ilk 429 = $ilk429. istek. Dizi: $dizi")
      } elseif ($s429 -ge 21) {
        Add-Check "RATE-001 login: 429 uretildi" 'WARN' ("Tum istekler 429 dondu -> limit AKTIF ama 20->21 gecisi kanitlanamadi (butce onceden dolu olabilir). Dizi: $dizi")
      } else {
        Add-Check "RATE-001 login: 429 uretildi" 'FAIL' ("Hic 429 yok -> limiter devrede degil. Dizi: $dizi")
      }
      if ($ilk429 -eq 21) {
        Add-Check "RATE-001b login: tam 20 sonra 429" 'PASS' "ilk 429 tam 21. istekte (beklenen davranis)"
      } elseif ($ilk429 -gt 0) {
        Add-Check "RATE-001b login: tam 20 sonra 429" 'WARN' "ilk 429 $ilk429. istekte (beklenen 21) - ayni surecte onceden login yapildiysa aciklanabilir"
      } else {
        Add-Check "RATE-001b login: tam 20 sonra 429" 'FAIL' "429 hic gelmedi"
      }

      # ----------------------------------------------------------------
      # RATE-003: XFF BYPASS KAPALI MI? (docs/26 §4 bulgusu, docs/28 §1 duzeltmesi)
      # ----------------------------------------------------------------
      # Saldirganin taktigi: her istekte UYDURMA ve FARKLI bir X-Forwarded-For
      # gondererek her istekte yeni bir limiter bucket'i actirmak. Duzeltmeden
      # ONCE bu dizi hicbir 429 uretmezdi (limit tamamen atlatilirdi).
      #
      # Ayni sekilde X-Real-IP'i de degistiriyoruz: Express'in req.ip cozumunde
      # bu basligin da dikkate alinmadigi boylece kanitlanir.
      #
      # NEDEN BU DIZI AYRICA GUCLU KANIT: Hemen yukaridaki RATE-001 dizisi XFF
      # GONDERMEDIGI icin duzeltmeden SONRA 127.0.0.1 kovasini zaten DOLDURMUS
      # olur. Bu yuzden:
      #   - Duzeltme CALISIYORSA kova anahtari req.ip (127.0.0.1) oldugu icin bu
      #     dizi ANINDA 429 alir -> "ilk 429 = 1" beklenir.
      #   - Duzeltme CALISMIYORSA (ham XFF'e guven) her uydurma XFF yeni kova acar
      #     ve dolu kova HIC gorulmez -> 40 istek boyunca HIC 429 ALINMAZ.
      # Yani bu dizi, tek basina XFF bypass'in acik/kapali oldugunu AYIRT EDER.
      # (XFF gondermeyen RATE-001 dizisi bu ayrimi YAPAMAZ: bypass acikken de
      #  req.ip kovasini doldurup 429 uretir.)
      $defaultLoginMax = if ($EnvMap['LOGIN_RATE_LIMIT_MAX']) { [int]$EnvMap['LOGIN_RATE_LIMIT_MAX'] } else { 20 }
      $kodlarXff = @()
      for ($i = 1; $i -le 40; $i++) {
        $sahteXff = "203.0.113.$i"
        $r = Invoke-Kod -Method 'POST' -Url "$Base/api/auth/login" `
             -Body @{ username = 'dogrulama-yok'; password = 'dogrulama-yok' } `
             -EkBaslik @{ 'X-Forwarded-For' = $sahteXff; 'X-Real-IP' = "198.51.100.$i" }
        $kodlarXff += $r.Kod
      }
      $xff429 = ($kodlarXff | Where-Object { $_ -eq 429 }).Count
      $xffIlk429 = -1
      for ($i = 0; $i -lt $kodlarXff.Count; $i++) { if ($kodlarXff[$i] -eq 429) { $xffIlk429 = $i + 1; break } }
      $xffDizi = ($kodlarXff -join ' ')

      if ($defaultLoginMax -eq 20) {
        if ($xff429 -ge 1 -and $xffIlk429 -le 22) {
          # RATE-001 ayni IP kovasini doldurdugu icin ilk 429'un 1. istekte gelmesi beklenir.
          Add-Check "RATE-003 XFF bypass kapali (uydurma XFF limiter'i atlatamiyor)" 'PASS' `
            ("40 istek, her birinde FARKLI uydurma X-Forwarded-For + X-Real-IP -> 429 x $xff429; ilk 429 = $xffIlk429. istek (~1 beklenir: ayni IP kovasi RATE-001 ile doldu). Dizi: $xffDizi")
        } elseif ($xff429 -ge 1) {
          Add-Check "RATE-003 XFF bypass kapali (uydurma XFF limiter'i atlatamiyor)" 'WARN' `
            ("429 uretildi ama ilk 429 = $xffIlk429. istek (beklenen <=22) - dizi 20'den sonra gec 429 aldi; limiter'in XFF'e gore bolunup bolunmedigi net degil. Dizi: $xffDizi")
        } else {
          Add-Check "RATE-003 XFF bypass kapali (uydurma XFF limiter'i atlatamiyor)" 'FAIL' `
            ("40 farkli uydurma XFF ile HIC 429 ALINMADI -> limiter hala ham XFF'e guveniyor (bypass ACIK). Dizi: $xffDizi")
        }
      } else {
        Add-Check "RATE-003 XFF bypass kapali (uydurma XFF limiter'i atlatamiyor)" 'SKIP' `
          ("LOGIN_RATE_LIMIT_MAX=$defaultLoginMax (varsayilan 20 degil) -> bu sunucuda varsayilan butce kaniti uretilemez; XFF kaniti VARSAYILAN limitli sunucuda kosulmalidir.")
      }
    }
    Stop-DogrulamaSunucusu -Oturum $s1
    if ($s1) {
      Add-Check "Sunucu #1 kapatildi" ($(if ($s1.Harici) { 'WARN' } else { 'PASS' })) "rate-limit butcesi sonraki sunucu icin temiz"
    }
  }
} else {
  Bolum "2. FAZ 25.4 #3a - LOGIN RATE LIMIT - ATLANDI"
  Add-Check "login rate limit" 'SKIP' "-SkipRateLimit verildi"
}

# =================================================================
# FAZ B - TAZE SUNUCU #2: suitler + 25.4/25.5 kanitlari
# =================================================================
Bolum "2b. TEST FIXTURE ONARIMI (seed kullanicilari)"

# NEDEN: storage.ts loadDatabase() users icin "yoksa seed'den doldur" korumasi
# tasimaz; silinen seed kullanicisi (firmaadmin/rapor/pasifkullanici) geri gelmez.
# Bu kullanicilar yoksa faz252a / izolasyon / security gate / runtime authz
# zincirleme 401 alir. Arac idempotenttir ve yalnizca eksikleri ekler.
$fixOut = Join-Path $Tmp 'fixture-onarim.txt'
$fixErr = Join-Path $Tmp 'fixture-onarim-err.txt'
$fixArg = if ($script:NodeTsxModu) { @('--import', 'tsx') + @('tools/ensure-test-fixtures.mjs') }
          elseif ($script:TsxCliModu) { @('node_modules/tsx/dist/cli.mjs', 'tools/ensure-test-fixtures.mjs') }
          else { @() }
try {
  if ($fixArg.Count -eq 0) {
    Add-Check "fixture onarimi" 'WARN' "tsx yolu bulunamadi - atlandi"
  } else {
    $fp = Start-Process -FilePath $Node -ArgumentList $fixArg -WorkingDirectory $Root -PassThru -WindowStyle Hidden `
            -RedirectStandardOutput $fixOut -RedirectStandardError $fixErr
    $fbitti = $fp.WaitForExit(90000)
    $fixText = (@(
      (Get-Content $fixOut -Encoding UTF8 -ErrorAction SilentlyContinue)
      (Get-Content $fixErr -Encoding UTF8 -ErrorAction SilentlyContinue)
    ) -join "`n")
    $fixText | Set-Content (Join-Path $Tmp 'cikti-fixture-onarim.txt') -Encoding UTF8
    if (-not $fbitti) {
      try { Stop-Process -Id $fp.Id -Force -ErrorAction SilentlyContinue } catch { }
      Add-Check "fixture onarimi" 'FAIL' "arac zaman asimina ugradi (90 sn)"
    } elseif ($fixText -match 'FIXTURE-HATA') {
      Add-Check "fixture onarimi" 'FAIL' (($fixText -split "`n" | Where-Object { $_ -match 'FIXTURE-HATA' }) -join ' | ')
    } elseif ($fixText -match 'FIXTURE-EKLENDI') {
      $eklenen = (($fixText -split "`n" | Where-Object { $_ -match 'FIXTURE-EKLENDI' }) | ForEach-Object { $_.Trim() }) -join ' ; '
      Add-Check "fixture onarimi (eksik kullanicilar geri eklendi)" 'WARN' $eklenen
    } elseif ($fixText -match 'FIXTURE-OK') {
      Add-Check "fixture onarimi" 'PASS' (($fixText -split "`n" | Where-Object { $_ -match 'FIXTURE-OK' }) | Select-Object -First 1).Trim()
    } else {
      Add-Check "fixture onarimi" 'WARN' "beklenen etiket yok - ham cikti: cikti-fixture-onarim.txt"
    }
  }
} catch {
  Add-Check "fixture onarimi" 'WARN' ("calistirilamadi: " + $_.Exception.Message)
}

Bolum "3. SUNUCU #2 (taze butce) BASLATILIYOR"

# RATE LIMIT BUTCE AYARI (yalnizca sunucu #2 icin):
# Suitler AYNI IP'den cok sayida login yapar; 20/15dk butcesi paylasildiginda
# zincirleme 429 olusuyor ve suitler kanit uretemiyor (kosu #2: runtime authz +
# 25.5 backup FAIL). Sunucu #1'in rate-limit KANITI varsayilan 20 ile alindigi
# icin burada butce yukseltilebilir. Limit ZAYIFLATILMIYOR — yalnizca dogrulama
# kosusunda, ACIKCA raporlanan bir sapma ile yukseltiliyor. Uretim davranisi
# (.env'de bu anahtar yoksa) varsayilan 20 olarak DEGISMEZ.
$RlMaxOnceki = $env:LOGIN_RATE_LIMIT_MAX
$env:LOGIN_RATE_LIMIT_MAX = '500'
Add-Check "Sunucu #2 login rate-limit butcesi (dogrulama sapmasi)" 'WARN' "LOGIN_RATE_LIMIT_MAX=500 (varsayilan 20; suitler kanit uretebilsin diye yukseltildi - URETIM DAVRANISI DEGIL)"
$s2 = Start-DogrulamaSunucusu -Ad 'ana'
if (-not $s2.Ok) {
  Add-Check "Sunucu #2 basladi" 'BLOCKED' ("Sunucu ayaga kalkmadi -> canli suitler kosulamaz. Log: sunucu-ana-err.log`n            ILK SATIRLAR: " + (((Get-Content $s2.Err -Encoding UTF8 -ErrorAction SilentlyContinue | Select-Object -First 8) -join ' | ')))
} else {
  Add-Check "Sunucu #2 basladi" ($(if ($s2.Harici) { 'WARN' } else { 'PASS' })) ($(if ($s2.Harici) { "Portu harici bir sunucu tutuyor; suitler ona karsi kosacak ve script onu KAPATMAYACAK" } else { "PID {0}  ({1})" -f $s2.Proc.Id, $Base }))
}

# ---------------------------------------------------------------- STATIK SUITLER
Bolum "4. STATIK SUITLER (sunucu gerekmez)"

Invoke-Suite -Etiket "FAZ 25.2-C tenant sourcing (statik)" -Script 'server/tests/faz252cTenantSourcingTest.mjs' -Tip 'MUTABAKAT' | Out-Null

Invoke-Suite -Etiket "FAZ 25.2-D #1 rol x endpoint matris jeneratoru" -Script 'server/tests/faz252dAuthzMatrixGenerator.mjs' -Tip 'YOK' -BasariliDesen 'Bulunan endpoint\s*:\s*\d+' | Out-Null

Invoke-Suite -Etiket "FAZ 25.2-D #4 frontend matris hizalama" -Script 'server/tests/faz252dFrontendMatrixAlignmentTest.mjs' -Tip 'PASSFAIL' | Out-Null

# 2026-09-14 — KIMLIK BILGISI KASASI (credentialVault.ts) regresyonu.
# AES-256-GCM sifreleme, legacy (base64/duz metin) okuma uyumu, kurcalama tespiti,
# anahtar yokken fail-closed ve migrasyon idempotentligi olculur.
# AG CAGRISI YAPMAZ, .env OKUMAZ (anahtari test kendi kurar) -> sunucu gerekmez.
Invoke-Suite -Etiket "credential vault regresyonu (AES-256-GCM)" -Script 'server/tests/credentialVaultRegressionTest.ts' -Tip 'PASSFAIL' | Out-Null

# Registry testi derlenmis barrel arar -> tsx koprusu uret
$kopru = & $Node 'tools/gen-security-barrel.mjs' 2>&1 | ForEach-Object { "$_" }
$kopruOk = Test-Path (Join-Path $Root '.verify-tmp\securitybarrel\index.js')
Add-Check "registry test koprusu" ($(if ($kopruOk) { 'PASS' } else { 'FAIL' })) (($kopru -join ' ').Trim())
if ($kopruOk) {
  Invoke-Suite -Etiket "FAZ 25.2-B permission registry" -Script 'server/tests/faz252bPermissionRegistryTest.mjs' -ExtraArgs @('.verify-tmp/securitybarrel') -Tip 'MUTABAKAT' | Out-Null
} else {
  Add-Check "FAZ 25.2-B permission registry" 'BLOCKED' "kopru uretilemedi"
}

# ---------------------------------------------------------------- SECRET TARAMASI (25.3 statik iddialar)
Bolum "5. FAZ 25.3 - STATIK SECRET / BYPASS TARAMASI (kod)"

function Test-Desen {
  param([string]$Ad, [string]$Desen, [string]$Kapsam = 'server')
  # KOD ile YORUM ayrimi: bir kalibin yalnizca yorumda gecmesi ihlal DEGILDIR
  # (or. "X bypass kaldirildi" aciklamasi). Yorum satirlari sayilmaz, ayrica bildirilir.
  $dosyalar = Get-ChildItem -Path (Join-Path $Root $Kapsam) -Recurse -Include *.ts,*.tsx,*.mjs,*.js -File -ErrorAction SilentlyContinue |
              Where-Object { $_.FullName -notmatch '\\node_modules\\' }
  $kodHit = @(); $yorumHit = 0
  foreach ($d in $dosyalar) {
    $no = 0
    foreach ($satir in [System.IO.File]::ReadAllLines($d.FullName)) {
      $no++
      if ($satir -notmatch $Desen) { continue }
      $t = $satir.Trim()
      if ($t.StartsWith('//') -or $t.StartsWith('*') -or $t.StartsWith('/*')) { $yorumHit++; continue }
      $rel = $d.FullName.Replace($Root + '\', '')
      $kodHit += ("{0}:{1}" -f $rel, $no)
    }
  }
  $n = $kodHit.Count
  $liste = if ($n -gt 0) { " -> " + (($kodHit | Select-Object -First 4) -join ', ') } else { '' }
  $yorumNot = if ($yorumHit -gt 0) { "  [$yorumHit yorum satirinda aciklama olarak geciyor - ihlal degil]" } else { '' }
  Add-Check $Ad ($(if ($n -eq 0) { 'PASS' } else { 'FAIL' })) ("KODDA {0} eslesme{1}{2}" -f $n, $liste, $yorumNot)
}

Test-Desen -Ad "Bypass imza kaldirildi (mock-valid-signature)" -Desen 'mock-valid-signature' -Kapsam 'server'
Test-Desen -Ad "Hardcode webhook secret kaldirildi" -Desen 'isbey-webhook-secret-key-2026' -Kapsam 'server'
Test-Desen -Ad "UtilEncrypt log sizintisi kapandi" -Desen 'UtilEncrypt Data' -Kapsam 'server'
# 2026-09-13: Hızlı Bilişim servislerinde HAM entegratör yanıtının log'a/istemciye
# dokuldugu desenler. UtilEncrypt/Login yanıtları hash ve JWT tasiyabilir; hata
# dallarinda yanitin TAMAMINI yazmak kimlik sizma yoludur. Bu desenler geri
# gelirse FAIL (bkz. hizliConnectService.ts + hizliDefterService.ts duzeltmesi).
Test-Desen -Ad "Ham entegrator yaniti log/istemciye dokulmuyor" -Desen 'err\?\.response\?\.data \|\| err\.message|JSON\.stringify\(d\)|JSON\.stringify\(err\.response\.data\)' -Kapsam 'server'
Test-Desen -Ad "Hardcode sk-proj- / AKIA anahtari yok" -Desen 'sk-proj-[A-Za-z0-9]|AKIA[0-9A-Z]{16}' -Kapsam 'server'

# 2026-09-14 — KIMLIK BILGISI SAKLAMA SERTLESTIRMESI REGRESYONU.
# (docs/30 §5; server/security/credentialVault.ts)
#
# Neden desen: base64 geri dondurulebilir bir KODLAMADIR, sifreleme degil. Onceki
# halde e-invoice-settings.ts firma WS sifresini `Buffer.from(x).toString('base64')`
# ile, hizli-bilisim.ts ise `portalCredentials.wsPassword` alanini DUZ METIN
# sakliyordu; `data/database.json` ele gecirildiginde ikisi de aciktaydi. Bu iki
# satir geri gelirse FAIL.
#
# NOT: Bu desen yalniz ROTALARI tarar (`server/routes`) — kasa modulu kendi
# icinde base64'u BILINCLI olarak kullanir (iv/tag/ciphertext tasima bicimi).
Test-Desen -Ad "Firma sifresi base64 ile saklanmiyor (e-invoice-settings)" -Desen "Buffer\.from\((password|apiKey|apiSecret)\)\.toString\('base64'\)" -Kapsam 'server/routes'
Test-Desen -Ad "wsPassword DUZ METIN yazilmiyor (hizli-bilisim)" -Desen 'wsPassword\s*:\s*wsPassword|portalCredentials\.wsPassword\s*=\s*wsPassword' -Kapsam 'server/routes'
Test-Desen -Ad "Ham UtilEncrypt yaniti loglanmiyor" -Desen 'JSON\.stringify\(encData\)' -Kapsam 'server/tests'

# ---------------------------------------------------------------- CANLI SUITLER
Bolum "6. CANLI SUITLER (sunucu #2 uzerinde)"

if (-not $s2.Ok) {
  foreach ($t in @(
    'FAZ 25.2-A smoke (C1/C2/C4/C5)',
    'FAZ 25.1 izolasyon (COMPANY_ADMIN tenant)',
    'FAZ 25.1 security gate',
    'FAZ 25.2-D #2 runtime authz suite',
    'FAZ 25.2-D #3 VAT rapor deger dogrulamasi',
    'FAZ 25.2-E auth/users sertlestirme',
    'FAZ 18 Hizli Bilisim sandbox (UtilEncrypt+Login)'
  )) { Add-Check $t 'BLOCKED' "sunucu #2 ayakta degil" }
} else {
  Invoke-Suite -Etiket "FAZ 25.2-A smoke (C1/C2/C4/C5)" -Script 'server/tests/faz252aAuthorizationTest.mjs' -Tip 'MUTABAKAT' | Out-Null
  Invoke-Suite -Etiket "FAZ 25.1 izolasyon (COMPANY_ADMIN tenant)" -Script 'server/tests/faz25IzolasyonTest.mjs' -Tip 'MUTABAKAT' | Out-Null
  Invoke-Suite -Etiket "FAZ 25.1 security gate" -Script 'server/tests/faz25SecurityGateTest.mjs' -Tip 'PASSFAIL' -ZamanAsimi 420 | Out-Null
  # Kosu #5 kabul kriteri: vat-report yalniz 500 dondurmemeli; degerler bagimsiz
  # referans hesabiyla birebir karsilasmali (bkz. faz252dVatReportValueTest.mjs).
  Invoke-Suite -Etiket "FAZ 25.2-D #3 VAT rapor deger dogrulamasi" -Script 'server/tests/faz252dVatReportValueTest.mjs' -Tip 'MUTABAKAT' | Out-Null
  # /api/auth/users sertlestirmesi: runtime authz paketi bu uçta POST'u SKIP ediyor ve
  # GET'te yalniz HTTP kodunu goruyordu (bkz. test dosyasi basligi). Bu suite cross-tenant
  # yazma, yetki yukseltme, kota, GET izolasyonu ve SUPER_ADMIN regresyonunu olcer.
  Invoke-Suite -Etiket "FAZ 25.2-E auth/users sertlestirme" -Script 'server/tests/faz252eAuthUsersHardeningTest.mjs' -Tip 'PASSFAILSKIP' -ZamanAsimi 300 | Out-Null
  $rt = Invoke-Suite -Etiket "FAZ 25.2-D #2 runtime authz suite" -Script 'server/tests/faz252dRuntimeAuthzSuite.mjs' -ExtraArgs @('--base', $Base) -Tip 'PASSFAILSKIP' -ZamanAsimi 600
  if ($rt.Durum -eq 'FAIL' -and $rt.FAIL -gt 0) {
    $failListe = Join-Path $Tmp 'runtime-authz-FAIL-listesi.txt'
    ($rt.Ham -split "`n" | Select-String -SimpleMatch 'FAIL' | Select-Object -First 40) | Set-Content $failListe -Encoding UTF8
    Add-Check "runtime authz FAIL dokumu" 'WARN' ("ilk 40 FAIL -> {0}" -f (Split-Path -Leaf $failListe))
  }
  $json = Join-Path $Root 'server\tests\output\runtime-authz-results.json'
  if (Test-Path $json) { Add-Check "runtime authz ham sonuc dosyasi" 'PASS' "server/tests/output/runtime-authz-results.json" }

  # ----------------------------------------------------------------
  # FAZ 18: HIZLI BILISIM ENTEGRASYONU (test ortami)
  # (kullanicinin 7. adimi — gercek Login/UtilEncrypt akisi)
  # ----------------------------------------------------------------
  # Bu suite GERCEK API cagrisi yapar (UtilEncrypt -> Login) ama YALNIZCA
  # HIZLI_BILISIM_IS_TEST_MODE=true iken. Test modu kapaliysa canli auth
  # adimlari SKIP eder -> kalem BLOCKED'a duser (PASS sayilmaz).
  # Bu asama CANLI BELGE GONDERMEZ; kontor yakilmaz (CLAUDE.md md.1 korunur).
  # Sunucu gerektirmez (dogrudan servisi cagirir) ama sunucu #2 blogunda
  # kosmasi credential/.env baglaminin kurulu oldugu yerdir.
  Invoke-Suite -Etiket "FAZ 18 Hizli Bilisim sandbox (UtilEncrypt+Login)" -Script 'server/tests/phase18HizliBilisimIntegrationTest.ts' -Tip 'HIZLI' -ZamanAsimi 300 | Out-Null

  # ----------------------------------------------------------------
  # FAZ 19: BELGE YASAM DONGUSU (test ortami)
  # ----------------------------------------------------------------
  # Yasam dongusunun AUTH + SORGULAMA ayagini gercek sandbox'a karsi kosar.
  # BELGE GONDERIMI (SendDocument) ve IPTAL (CancelDocument) KASTEN YAPILMAZ:
  # kontor tuketirler. Bu adimlar SKIP raporlanir ve HIZLI dalinin karar
  # mantigi SKIP'i PASS saymadigi icin kalem BLOCKED'a duser — bu DOGRU
  # sonuctur (bkz. docs/31 B-3/B-5). Kontor tuketimi bu kosuda 0'dir.
  # Ayrica kosu ortaminin egress engelini ONCE olcup raporlar; engel varsa
  # dis iddialar FAIL degil SKIP olur (ortam engeli != urun hatasi).
  Invoke-Suite -Etiket "FAZ 19 belge yasam dongusu sandbox (auth+sorgulama)" -Script 'server/tests/phase19DocumentLifecycleTest.ts' -Tip 'HIZLI' -ZamanAsimi 300 | Out-Null
}

# ---------------------------------------------------------------- 25.4 KANITLARI
Bolum "7. FAZ 25.4 - CANLI GUVENLIK KANITLARI"

if (-not $s2.Ok) {
  foreach ($t in @('SEC-001 guvenlik basliklari', 'SEC-005 CORS davranisi', 'RATE-002 webhook rate limit')) { Add-Check $t 'BLOCKED' "sunucu #2 ayakta degil" }
} else {
  # a) guvenlik basliklari
  $h = Invoke-Kod -Method 'GET' -Url "$Base/api/health"
  if ($h.Kod -eq 200 -and $h.Basliklar) {
    $b = $h.Basliklar
    $nosniff = ($b['X-Content-Type-Options'] -join '')
    $frame   = ($b['X-Frame-Options'] -join '')
    $ref     = ($b['Referrer-Policy'] -join '')
    $xss     = ($b['X-XSS-Protection'] -join '')
    $hepsi = ($nosniff -eq 'nosniff') -and ($frame -eq 'DENY') -and ($ref -eq 'no-referrer')
    Add-Check "SEC-001 guvenlik basliklari (nosniff/frame/referrer)" ($(if ($hepsi) { 'PASS' } else { 'FAIL' })) ("X-Content-Type-Options='$nosniff'  X-Frame-Options='$frame'  Referrer-Policy='$ref'  X-XSS-Protection='$xss'")
    $hsts = ($b['Strict-Transport-Security'] -join '')
    Add-Check "SEC-002 HSTS (opsiyonel)" ($(if ($EnvMap['ENABLE_HSTS'] -eq 'true') { $(if ($hsts) { 'PASS' } else { 'FAIL' }) } else { 'SKIP' })) ("ENABLE_HSTS='$($EnvMap['ENABLE_HSTS'])'  header='$hsts'")
  } else {
    Add-Check "SEC-001 guvenlik basliklari" 'FAIL' ("/api/health -> HTTP {0} ({1})" -f $h.Kod, $h.Icerik)
  }

  # b) CORS - YABANCI bir Origin ile preflight gonderilir
  $allowCfg = $EnvMap['CORS_ALLOW_ORIGINS']
  $c = Invoke-Kod -Method 'OPTIONS' -Url "$Base/api/health" -EkBaslik @{
    'Origin'                        = 'https://yabanci-site.example'
    'Access-Control-Request-Method' = 'GET'
  }
  $cor = ''
  if ($c.Basliklar) { $cor = ($c.Basliklar['Access-Control-Allow-Origin'] -join '') }
  if ([string]::IsNullOrWhiteSpace($allowCfg)) {
    Add-Check "SEC-005 CORS (allowlist TANIMSIZ -> mevcut acik davranis)" 'PASS' ("Access-Control-Allow-Origin='{0}' (allowlist kapali; gelistirme davranisi korunuyor)" -f $cor)
  } else {
    Add-Check "SEC-005 CORS allowlist aktif" ($(if ([string]::IsNullOrWhiteSpace($cor)) { 'PASS' } else { 'FAIL' })) ("CORS_ALLOW_ORIGINS tanimli; yabanci origin karsiligi='{0}' (bos beklenir)" -f $cor)
  }
  Add-Check "LOCAL_DEV_ALLOW" 'SKIP' ("deger='{0}' (bilgi)" -f $EnvMap['LOCAL_DEV_ALLOW'])

  # c) backup + checksum (25.5 #2/#3)
  $lr = Invoke-Kod -Method 'POST' -Url "$Base/api/auth/login" -Body @{ username = 'admin'; password = 'admin123' }
  $token = ''
  if ($lr.Kod -eq 200) { try { $token = ($lr.Icerik | ConvertFrom-Json).token } catch { } }
  if (-not $token) {
    Add-Check "25.5 backup kaniti" 'FAIL' ("admin login basarisiz -> HTTP {0} (429 ise: login butcesi dolu, scripti tekrar calistirin)" -f $lr.Kod)
  } else {
    $bk = Invoke-Kod -Method 'POST' -Url "$Base/api/settings/backup" -Body '{}' -Token $token
    $bkJson = $null
    try { $bkJson = $bk.Icerik | ConvertFrom-Json } catch { }
    if ($bk.Kod -eq 200 -and $bkJson) {
      $cv = "$($bkJson.checksumVerified)"
      Add-Check "25.5 #3 backup checksum self-dogrulama" ($(if ($cv -eq 'True') { 'PASS' } else { 'FAIL' })) ("HTTP 200, filename='$($bkJson.filename)', checksumVerified=$cv")
    } else {
      Add-Check "25.5 #3 backup checksum self-dogrulama" 'FAIL' ("HTTP {0} -> {1}" -f $bk.Kod, $bk.Icerik)
    }

    # sidecar + checksum bütünlüğü (yerel dogrulama)
    $bkDir = Join-Path $Root 'data\backups'
    if (Test-Path $bkDir) {
      $son = Get-ChildItem $bkDir -Filter '*.json' -File | Sort-Object LastWriteTime | Select-Object -Last 1
      if ($null -eq $son) {
        Add-Check "25.5 #3 sidecar (.sha256) varligi" 'FAIL' "data\backups icinde hic .json yedek yok"
      } elseif (Test-Path "$($son.FullName).sha256") {
        $gercek = (Get-FileHash -Path $son.FullName -Algorithm SHA256).Hash.ToLower()
        $beklenen = (Get-Content "$($son.FullName).sha256" -Raw).Trim().Split(' ')[0].ToLower()
        Add-Check "25.5 #3 sidecar (.sha256) bütünlüğü" ($(if ($gercek -eq $beklenen) { 'PASS' } else { 'FAIL' })) ("{0} -> {1}" -f $son.Name, $(if ($gercek -eq $beklenen) { 'CHECKSUM MATCH' } else { "MISMATCH (gercek=$gercek beklenen=$beklenen)" }))
      } else {
        Add-Check "25.5 #3 sidecar (.sha256) varligi" 'FAIL' ("{0} icin sidecar bulunamadi" -f $son.Name)
      }
      $sayi = @(Get-ChildItem $bkDir -Filter '*.json' -File).Count
      $limit = if ($EnvMap['BACKUP_RETENTION_COUNT']) { [int]$EnvMap['BACKUP_RETENTION_COUNT'] } else { 20 }
      Add-Check "25.5 #2 retention (json sayisi <= $limit)" ($(if ($sayi -le $limit) { 'PASS' } else { 'FAIL' })) ("data\backups icinde $sayi json yedek var (BACKUP_RETENTION_COUNT=$limit)")
    } else {
      Add-Check "25.5 backup klasoru" 'FAIL' "data\backups yok"
    }
  }

  # ----------------------------------------------------------------
  # SEC-006: /api/hizli-bayi yanitlarinda WS SIFRESI SIZMIYOR MU?
  # (docs/28 §11.1 — portalCredentials.wsPassword sizintisi duzeltmesi)
  # ----------------------------------------------------------------
  # Duzeltmeden ONCE bu uc ham `dealerCustomers` kaydini donduruyordu; kayit
  # `portalCredentials.wsPassword` alaninda DUZ METIN web servis sifresi tasir.
  # Yani modul erisimi olan her kullaniciya tum firmalarin WS sifresi gidiyordu.
  #
  # AYIRT GUCU: Yanit govdesinde `wsPassword` / `portalCredentials` / `apiKey`
  # / `secretKey` ANAHTARLARININ GECMEMESI beklenir. Duzeltme calisiyorsa
  # yalnizca `wsUsername` + `hasWsPassword` gorulur.
  #
  # NOT: Bu uç modul izniyle korunur; `$token` (admin) SUPER_ADMIN oldugu icin
  # erisir. 401/403 donerse kanit uretilemez -> BLOCKED (PASS sayilmaz).
  if (-not $token) {
    Add-Check "SEC-006 hizli-bayi yanitinda WS sifresi yok" 'BLOCKED' "admin token yok (login basarisiz)"
  } else {
    $hb = Invoke-Kod -Method 'GET' -Url "$Base/api/hizli-bayi/customers" -Token $token
    if ($hb.Kod -ne 200) {
      Add-Check "SEC-006 hizli-bayi yanitinda WS sifresi yok" 'BLOCKED' ("GET /api/hizli-bayi/customers -> HTTP {0} (kanit uretilemedi)" -f $hb.Kod)
    } else {
      # Ham metinde anahtar aranir: JSON alan adi olarak gecmesi yeterlidir.
      $sizan = @()
      foreach ($anahtar in @('"wsPassword"', '"portalCredentials"', '"secretKey"', '"apiKey"')) {
        if ($hb.Icerik -like "*$anahtar*") { $sizan += $anahtar }
      }
      if ($sizan.Count -eq 0) {
        $hasMask = ($hb.Icerik -like '*"hasWsPassword"*')
        Add-Check "SEC-006 hizli-bayi yanitinda WS sifresi yok" 'PASS' `
          ("Yanit govdesinde wsPassword/portalCredentials/secretKey/apiKey ANAHTARI yok. Maskeleme alani (hasWsPassword) mevcut=$hasMask. HTTP 200, {0} karakter." -f $hb.Icerik.Length)
      } else {
        Add-Check "SEC-006 hizli-bayi yanitinda WS sifresi yok" 'FAIL' `
          ("Yanitta SIZAN anahtarlar: {0} -> credential frontend'e gidiyor (docs/28 §11.1 regresyonu)." -f ($sizan -join ', '))
      }
    }
  }

  # d) webhook rate limit - EN SON (bucket 1 dk / 60)
  if ($SkipRateLimit) {
    Add-Check "RATE-002 webhook rate limit" 'SKIP' "-SkipRateLimit verildi"
  } else {
    $kodlar = @()
    for ($i = 1; $i -le 61; $i++) {
      $r = Invoke-Kod -Method 'POST' -Url "$Base/api/v1/payments/webhook" -Body '{}'
      $kodlar += $r.Kod
    }
    $s429 = ($kodlar | Where-Object { $_ -eq 429 }).Count
    $s401 = ($kodlar | Where-Object { $_ -eq 401 }).Count
    $s503 = ($kodlar | Where-Object { $_ -eq 503 }).Count
    $ilk429 = -1
    for ($i = 0; $i -lt $kodlar.Count; $i++) { if ($kodlar[$i] -eq 429) { $ilk429 = $i + 1; break } }
    $ozetD = "401 x $s401, 503 x $s503, 429 x $s429; ilk 429 = $ilk429. istek"
    if ($s429 -ge 1 -and ($s401 + $s503) -ge 1) {
      Add-Check "RATE-002 webhook rate limit (1dk/60)" 'PASS' $ozetD
    } else {
      Add-Check "RATE-002 webhook rate limit (1dk/60)" 'FAIL' ("429 uretilmedi veya hic kimlik reddi yok. $ozetD")
    }
    if (($s401 + $s503) -ge 1) {
      Add-Check "25.3 #3 webhook fail-closed (imzasiz -> 401/503)" 'PASS' ("imzasiz istek reddedildi: $ozetD")
    } else {
      Add-Check "25.3 #3 webhook fail-closed (imzasiz -> 401/503)" 'FAIL' $ozetD
    }
  }
}

# ---------------------------------------------------------------- HEAVY MUHASEBE
# NOT: Bu suitler data/database.json'a YAZAR. Sunucu ayaktayken kosarsa iki surec
#      ayni dosyayi ezer -> once sunucuyu kapatmak ZORUNLUDUR.
if ($s2) {
  Stop-DogrulamaSunucusu -Oturum $s2
  # Dogrulama sapmasini geri al (sonraki adimlar etkilenmesin)
  if ([string]::IsNullOrEmpty($RlMaxOnceki)) { Remove-Item Env:\LOGIN_RATE_LIMIT_MAX -ErrorAction SilentlyContinue }
  else { $env:LOGIN_RATE_LIMIT_MAX = $RlMaxOnceki }
  if ($s2.Harici) {
    Add-Check "Sunucu #2 kapatildi" 'WARN' "harici sunucu bizim degil - KAPATILMADI (elle durdurun)"
  } else {
    Add-Check "Sunucu #2 kapatildi (DB cakismasi onlendi)" 'PASS' "port temizlendi"
  }
}

Bolum "8. MUHASEBE BUTUNLUK SUITLERI (kritik degismez)"

if ($SkipHeavy) {
  Add-Check "Muhasebe butunluk suitleri" 'SKIP' "-SkipHeavy verildi"
} elseif ($s2 -and $s2.Harici) {
  Add-Check "Muhasebe butunluk suitleri" 'SKIP' "harici sunucu ayakta - ayni DB dosyasina iki surec yazmasin diye atlandi. 'npm run dev' durdurup scripti tekrar calistirin."
} else {
  Invoke-Suite -Etiket "Bilanco denkligi (aktif=pasif, fark=0,00)" -Script 'server/tests/accountingRealityAndClosingTest.ts' -Tip 'KONTROL' -ZamanAsimi 600 | Out-Null
  Invoke-Suite -Etiket "3 aylik muhasebe simulasyonu" -Script 'server/tests/threeMonthAccountingSimulation.ts' -Tip 'KONTROL' -ZamanAsimi 900 | Out-Null
}

# ---------------------------------------------------------------- KAPANIS

# 2026-09-12: KAPALI KAPI — gercek e-Fatura/e-Arsiv belge akisi.
# Bu kalem KASITLI olarak FAIL/SKIP degil; "kapi kapali" olarak raporlanir.
# Gerekce (CLAUDE.md md.1): canli Hizli Bilisim kullanimi TUM QA PASS olmadan
# ACILMAZ. Bu kosuda belge gonderimi (kontor tuketen islem) YAPILMAMISTIR ve
# bu script onu YAPMAZ. Asagidaki kosullar saglanana kadar bu kapi kapalidir.
$kapilar = @()
# 1) Tip kontrolu + build yesil mi?
$buildCheck = $script:Checks | Where-Object { $_.Ad -like 'BUILD *' } | Select-Object -First 1
$tscCheck   = $script:Checks | Where-Object { $_.Ad -like 'TSC-SERVER*' } | Select-Object -First 1
if ($buildCheck -and $buildCheck.Durum -ne 'PASS') { $kapilar += "npm run build PASS degil ($($buildCheck.Durum))" }
if ($tscCheck -and $tscCheck.Durum -eq 'FAIL')    { $kapilar += "sunucu tip kontrolunde YENI hata var" }
# 2) Hizli Bilisim sandbox kaniti uretildi mi?
# NOT: SEC-013 blogunda `$f18` test DOSYASININ METNI anlamina gelir; burada
# ise kontrol KALEMI. Karismamasi icin kalem ayri adla tutulur.
$f18Kalem = $script:Checks | Where-Object { $_.Ad -like 'FAZ 18*' } | Select-Object -First 1
if (-not $f18Kalem) { $kapilar += "FAZ 18 kalemi kosulmadi" }
elseif ($f18Kalem.Durum -ne 'PASS') { $kapilar += "FAZ 18 durumu $($f18Kalem.Durum) (PASS gerekli)" }
# 3) Guvenlik kalemleri
foreach ($g in @('SEC-006 hizli-bayi yanitinda WS sifresi yok', 'RATE-003 XFF bypass kapali (uydurma XFF limiter''i atlatamiyor)', 'SEC-007 production gecis kilidi', 'SEC-008 send-invoice basari kontrolu', 'SEC-011 gonderim sonrasi dogru raporlama', 'SEC-012 MOCK sessiz fallback kapali', 'SEC-013 FAZ18 canli adres korumasi', 'SEC-014 e-Donusum canli ortam kilidi')) {
  $c = $script:Checks | Where-Object { $_.Ad -eq $g } | Select-Object -First 1
  if (-not $c) { $kapilar += "guvenlik kalemi kosulmadi: $g" }
  elseif ($c.Durum -ne 'PASS') { $kapilar += "$g durumu $($c.Durum)" }
}

# 4) FAZ 19 belge yasam dongusu: GONDERIM ve IPTAL ayaklari KANITLANMIS olmali.
# NOT: Bu kalem su an kasten BLOCKED doner (gonderim kontor tuketir, ayri onay
# fazi gerekir). Buraya eklenmesinin nedeni, "FAZ 18 PASS" tek basina kapinin
# acilmasi icin yeterliymis gibi gorunmesini engellemektir: yasam dongusunun
# yarisi kanitlanmadan canli belge akisi acilamaz.
$f19Kalem = $script:Checks | Where-Object { $_.Ad -like 'FAZ 19*' } | Select-Object -First 1
if (-not $f19Kalem) { $kapilar += "FAZ 19 kalemi kosulmadi" }
elseif ($f19Kalem.Durum -ne 'PASS') { $kapilar += "FAZ 19 durumu $($f19Kalem.Durum) (belge gonderim/iptal ayagi kanitlanmadi)" }

if ($kapilar.Count -eq 0) {
  Add-Check "KAPI: canli e-Fatura/e-Arsiv belge akisi" 'WARN' `
    "On kosullar saglandi ancak BELGE GONDERIMI bu script tarafindan YAPILMAZ. Ayri onay fazi gerekir (kontor tuketir)."
} else {
  Add-Check "KAPI: canli e-Fatura/e-Arsiv belge akisi" 'BLOCKED' `
    ("KAPI KAPALI - eksik on kosullar: " + ($kapilar -join ' | ') + ". Belge gonderimi yapilmadi (dogru davranis).")
}

Push-Location $Root
$gitDurum = ''
try {
  $gitDurum = (& git status --porcelain 2>&1 | ForEach-Object { "$_" }) -join "`n"
  Add-Check "git status alindi" 'PASS' ("{0} degisiklik satiri" -f (@($gitDurum -split "`n" | Where-Object { $_ }).Count))
} catch { Add-Check "git status" 'SKIP' "git calistirilamadi" }
Pop-Location

# ---------------------------------------------------------------- RAPOR
$ozet = $script:Checks | Group-Object Durum | ForEach-Object { "{0}={1}" -f $_.Name, $_.Count }
$satirlar = @()
$satirlar += "================================================================"
$satirlar += " ISBEY CLOUD - DOGRULAMA RAPORU"
$satirlar += " Tarih    : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$satirlar += " Makine   : $env:COMPUTERNAME   Kullanici: $env:USERNAME"
$satirlar += " Proje    : $Root"
$satirlar += " Node     : $(& $Node -v)"
$yol = if ($script:NodeTsxModu) { 'node --import tsx' } elseif ($script:TsxCliModu) { 'node tsx/dist/cli.mjs' } else { 'cmd /c npx tsx' }
$satirlar += " Calistir : $yol"
$satirlar += " Port     : $Port"
$satirlar += " Surum    : 2026-09-15b (FAZ 19 belge yasam dongusu suiti pakete baglandi: auth+sorgulama ayagi gercek sandbox'a karsi kosar, GONDERIM/IPTAL kasten yapilmaz -> SKIP -> BLOCKED. Kapanis kapisina FAZ 19 kalemi eklendi: FAZ 18 PASS tek basina canli belge akisini acmaz. Ayrica surum 2026-09-15a icerigi korunur: 'HIZLI' karar dalı SKIP>0 durumunu PASS degil BLOCKED sayar; 2026-09-13c: SEC-014 PUT e-invoice-settings environment=PRODUCTION HIZLI_BILISIM_ALLOW_PROD onayi olmadan kabul EDILMEZ; hizli-defter TenantResolutionError 502 degil 401)"
$satirlar += " Ozellik  : SkipRateLimit=$SkipRateLimit SkipHeavy=$SkipHeavy NoBackup=$NoBackup"
$satirlar += "================================================================"
$satirlar += ""
$satirlar += "OZET: " + ($ozet -join "  |  ")
$satirlar += ""
$satirlar += "---- TUM KONTROLLER ----"
foreach ($c in $script:Checks) {
  $satirlar += ("[{0,-7}] {1}" -f $c.Durum, $c.Ad)
  if ($c.Detay) {
    foreach ($d in ($c.Detay -split "`n")) { $satirlar += ("          " + $d.Trim()) }
  }
}
if ($script:Fails.Count -gt 0) {
  $satirlar += ""
  $satirlar += "---- BASARISIZ KALEMLER (oncelik) ----"
  foreach ($f in $script:Fails) { $satirlar += ("  * " + $f) }
}
$satirlar += ""
$satirlar += "---- HAM CIKTILAR ----"
$satirlar += (Get-ChildItem $Tmp -Filter 'cikti-*.txt' -File | ForEach-Object { "  " + $_.Name + "  (" + [math]::Round($_.Length / 1KB, 1) + " KB)" })
$satirlar += ""
$satirlar += "NOT: Bu script hicbir testi 'gecmis' saymaz; yalnizca kosturur ve etiketler."
$satirlar += "     FAIL = kosuldu ve basarisiz | BLOCKED = ortam nedeniyle kosulamadi | SKIP = kapsam disi/atlandi"
$satirlar += ""
$satirlar += "---- RAPOR SONU ----"

$satirlar | Set-Content -Path $Rapor -Encoding UTF8

Bolum "SONUC"
foreach ($o in $script:Checks | Group-Object Durum) {
  $renk = switch ($o.Name) { 'PASS' { 'Green' } 'FAIL' { 'Red' } 'BLOCKED' { 'Magenta' } 'WARN' { 'Yellow' } default { 'DarkYellow' } }
  Write-Host ("  {0,-8} : {1}" -f $o.Name, $o.Count) -ForegroundColor $renk
}
Write-Host ''
if ($script:Fails.Count -gt 0) {
  Write-Host "  Basarisiz kalemler:" -ForegroundColor Red
  foreach ($f in $script:Fails) { Write-Host ("   - " + $f) -ForegroundColor Red }
  Write-Host ''
}
Write-Host "  RAPOR: $Rapor" -ForegroundColor Cyan
Write-Host "  Bu .txt dosyasini Claude'a geri gonderin." -ForegroundColor Cyan
Write-Host ''
Write-Host "  NOT: FAZ19 izole sunucu testi (port 4719) kapsam disidir." -ForegroundColor DarkGray

Pop-Location
