<#
  ISBEY CLOUD — FAZ 19 `GetDocumentListGUID` SOZLESME ISPAT ARACI (TEST/SANDBOX)
  =========================================================================
  AMAC
    `GetDocumentListGUID` ucunun GERCEK sozlesmesini OLCMEK (bkz. docs/48):
      S-G1  `AppType` numaralandirmasi hangisi? Kod her yerde `1` gonderiyor;
            bu deger hic OLCULMEDI (docs/40 yalniz CancelDocument ucunu olctu).
      S-G2  Yanit govdesi semasi nedir? (`documents` dizisi alanlari)
      S-G3  Yanitta is-seviyesi basari alani var mi?

  NE YAPMAZ
    · BELGE GONDERMEZ. `SendDocument` CAGRILMAZ. Iptal CAGRILMAZ.
    · PASS/FAIL karari URETMEZ. Ciktisi SOZLESME OLCUMUDUR, uygulama dogrulamasi degil.
    · Canli ortama ISTEK GONDERMEZ (asagidaki guvenlik kapisi bunu zorlar).
    · `GetDocumentReceiverAllList` OLCULMEZ (o uc AppType almiyor — ayri olcum).

  NASIL OLCER
    Ayni UYDURMA (var olmayan) belge kimligiyle SEKIZ deney:
      Deney D0: `appType` HIC YOK (kontrol/baseline imzasi)
      Deney D1..D7: `appType` = 1..7, govde sabit `{ appType, guids }`
    Hangi degerlerin kontrolden AYRISTIGI, o degerlerin API tarafindan
    TANINDIGINI gosterir. Var olmayan bir belge SORGULANAMAZ — ama sorgu
    YAPILIR; API'nin AppType'a verdigi dogrulama yaniti sozlesmeyi aciga cikarir.

  KONTOR NOTU
    Bu bir OKUMA sorgusudur; yazma/mutasyon yoktur. Ancak sorgu ucunun
    sandbox'ta kontor tuketip tuketmedigi BU ARACLA kanitlanamaz —
    kosumdan ONCE dogrulanmalidir (docs/48 §6).

  KOSUM (proje kokunde, PowerShell):
    powershell -ExecutionPolicy Bypass -File tools\faz19-guid-sozlesme-ispeti.ps1

  ON KOSULLAR (saglanmazsa HICBIR ISTEK GONDERILMEDEN durur):
    · .env icinde HIZLI_BILISIM_IS_TEST_MODE=true
    · .env icinde HIZLI_BILISIM_ALLOW_PROD bos veya false
    · .env icinde HIZLI_BILISIM_API_URL => econnecttest hostu (canli host ICERMEZ)
    · .env icinde test SecretKey / ApiKey / WS kullanici+sifre tanimli

  CIKTI
    Konsol: [SOZLESME_OLCUMU:OLCULDU | KOSULAMADI | GUVENLIK_IHLALI]
    .verify-tmp\faz19-guid-sozlesme-<zaman>.json  <- ham kanit (JWT maskeli)
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }
$OutputEncoding = [System.Text.Encoding]::UTF8

# ---------------------------------------------------------------- yerlesim
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root 'server\index.ts'))) {
  $Root = $PSScriptRoot | Split-Path -Parent
}
$Tmp = Join-Path $Root '.verify-tmp'
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

$damga = Get-Date -Format 'yyyyMMdd-HHmmss'
$Kayit = Join-Path $Tmp "faz19-guid-sozlesme-$damga.txt"

function Yaz { param([string]$M, [string]$R = 'Gray') Write-Host $M -ForegroundColor $R }

Push-Location $Root
try {
  Write-Host ('=' * 72) -ForegroundColor DarkCyan
  Write-Host '  ISBEY CLOUD — FAZ 19 GetDocumentListGUID SOZLESME ISPAT ARACI' -ForegroundColor Cyan
  Write-Host '=' * 72 -ForegroundColor DarkCyan
  Yaz '  Bu arac PASS uretmez; yalniz SOZLESME olcer. Belge GONDERMEZ, iptal ETMEZ.' 'DarkGray'
  Yaz '  Yalniz OKUMA sorgusu yapar. Canli ortama istek GITMEZ.' 'DarkGray'

  # ------------------------------------------------------------ 1. ON KOSUL
  Yaz ''
  Yaz '1. ON KOSULLAR' 'Cyan'

  $envDosya = Join-Path $Root '.env'
  if (-not (Test-Path $envDosya)) {
    Yaz "  [FAIL] .env bulunamadi: $envDosya" 'Red'
    exit 1
  }

  # .env'i AYRISIK oku (degerleri ekrana YAZMA)
  $envMap = @{}
  foreach ($satir in Get-Content $envDosya -Encoding UTF8) {
    $t = $satir.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    $i = $t.IndexOf('=')
    if ($i -lt 1) { continue }
    $envMap[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim()
  }

  function EnvAl { param([string]$Ad) if ($envMap.ContainsKey($Ad)) { return [string]$envMap[$Ad] } return '' }

  $isTest    = EnvAl 'HIZLI_BILISIM_IS_TEST_MODE'
  $allowProd = EnvAl 'HIZLI_BILISIM_ALLOW_PROD'
  $apiUrl    = EnvAl 'HIZLI_BILISIM_API_URL'
  $apiKey    = EnvAl 'HIZLI_BILISIM_API_KEY'
  $secretKey = EnvAl 'HIZLI_BILISIM_SECRET_KEY'
  $wsUser    = EnvAl 'HIZLI_BILISIM_WS_USERNAME'
  $wsPass    = EnvAl 'HIZLI_BILISIM_WS_PASSWORD'

  $TEST_HOST  = 'econnecttest.hizliteknoloji.com.tr'
  $CANLI_HOST = 'econnect.hizliteknoloji.com.tr'

  $hata = $false

  if ($isTest -ne 'true') {
    Yaz "  [FAIL] HIZLI_BILISIM_IS_TEST_MODE = '$isTest' (true olmali)" 'Red'; $hata = $true
  } else { Yaz '  [OK]   IS_TEST_MODE = true' 'Green' }

  if (-not [string]::IsNullOrWhiteSpace($allowProd) -and $allowProd.ToLower() -ne 'false') {
    Yaz "  [FAIL] HIZLI_BILISIM_ALLOW_PROD acik ('$allowProd') - production kilidi KAPALI olmali" 'Red'; $hata = $true
  } else { Yaz '  [OK]   ALLOW_PROD bos/kapali' 'Green' }

  if ($apiUrl -notlike "*$TEST_HOST*") {
    Yaz '  [FAIL] HIZLI_BILISIM_API_URL TEST hostunu gostermiyor' 'Red'; $hata = $true
  } else { Yaz '  [OK]   API URL => TEST/SANDBOX' 'Green' }

  if ($apiUrl -like "*$CANLI_HOST*") {
    Yaz '  [FAIL] HIZLI_BILISIM_API_URL canli host iceriyor' 'Red'; $hata = $true
  } else { Yaz '  [OK]   API URL canli host icermiyor' 'Green' }

  $credTam = ($apiKey -and $secretKey -and $wsUser -and $wsPass)
  if (-not $credTam) {
    $eksik = @()
    if (-not $apiKey)    { $eksik += 'API_KEY' }
    if (-not $secretKey) { $eksik += 'SECRET_KEY' }
    if (-not $wsUser)    { $eksik += 'WS_USERNAME' }
    if (-not $wsPass)    { $eksik += 'WS_PASSWORD' }
    Yaz "  [FAIL] Sandbox credential eksik: $($eksik -join ', ')" 'Red'; $hata = $true
  } else { Yaz '  [OK]   Sandbox credential tanimli (degerler yazdirilmaz)' 'Green' }

  if ($hata) {
    Yaz ''
    Yaz '  ⛔ ON KOSULLAR SAGLANMADI - hicbir istek GONDERILMEDI.' 'Red'
    Yaz ''
    Yaz '  [SOZLESME_OLCUMU:GUVENLIK_IHLALI]' 'Red'
    exit 1
  }

  # ------------------------------------------------------------ 2. KOSUM
  Yaz ''
  Yaz '2. OLCUM' 'Cyan'

  # tsx cagri yolu — ayni guvenilirlik sirasi (bkz. cancel-sozlesme-ispeti.ps1)
  $Node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $Node) { Yaz '  [FAIL] node bulunamadi (PATH)' 'Red'; exit 1 }
  Yaz "  [OK]   node: $Node" 'Green'

  $tsxCli = Join-Path $Root 'node_modules\tsx\dist\cli.mjs'
  $hedef  = 'server/tests/phase19GuidContractProbe.ts'

  $nodeTsxModu = $false
  try {
    $surumMetni = (& $Node -v) -as [string]
    if ($surumMetni -match '^v(\d+)\.') {
      $major = [int]$Matches[1]
      if ($major -ge 20 -and (Test-Path (Join-Path $Root 'node_modules\tsx'))) { $nodeTsxModu = $true }
    }
  } catch { $nodeTsxModu = $false }

  if ($nodeTsxModu) {
    Yaz '  [OK]   calistirma yolu: node --import tsx' 'Green'
    $exe = $Node
    $argList = @('--import', 'tsx', $hedef)
  } elseif (Test-Path $tsxCli) {
    Yaz '  [WARN] node --import tsx kullanilamiyor - tsx CLI ile cagrilacak' 'Yellow'
    $exe = $Node
    $argList = @('node_modules/tsx/dist/cli.mjs', $hedef)
  } else {
    Yaz '  [WARN] tsx bulunamadi - npx ile denenecek' 'Yellow'
    $exe = (Get-Command cmd -ErrorAction SilentlyContinue).Source
    if (-not $exe) { Yaz '  [FAIL] ne tsx ne cmd bulunamadi' 'Red'; exit 1 }
    $argList = @('/c', 'npx', 'tsx', $hedef)
  }

  $env:ISBEY_REPO_ROOT = $Root

  $raw    = Join-Path $Tmp "faz19-guid-raw-out-$damga.txt"
  $rawErr = Join-Path $Tmp "faz19-guid-raw-err-$damga.txt"

  $proc = Start-Process -FilePath $exe -ArgumentList $argList `
            -WorkingDirectory $Root -PassThru -WindowStyle Hidden `
            -RedirectStandardOutput $raw -RedirectStandardError $rawErr

  if (-not $proc.WaitForExit(300 * 1000)) {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }
    Yaz '  [FAIL] Olcum 5 dakikada tamamlanmadi - surec olduruldu' 'Red'
    $code = -9
  } else {
    try { $proc.WaitForExit() } catch { }
    try { $proc.Refresh() } catch { }
    $code = $proc.ExitCode
  }

  $satirlar = @()
  if (Test-Path $raw)    { $satirlar += Get-Content $raw -Encoding UTF8 }
  if (Test-Path $rawErr) { $satirlar += Get-Content $rawErr -Encoding UTF8 }
  if ($satirlar.Count -gt 0) {
    $satirlar | Set-Content -Path $Kayit -Encoding UTF8
  } else {
    'OLCUM CIKTISI BOS — betik hicbir sey yazmadi.' | Set-Content -Path $Kayit -Encoding UTF8
    $satirlar = @('OLCUM CIKTISI BOS — betik hicbir sey yazmadi.')
  }

  Write-Host (($satirlar -join "`n"))
  Yaz ''
  Yaz "  Olcum kaydi: $Kayit" 'DarkGray'

  # ------------------------------------------------------------ 3. KARAR
  $metin = $satirlar -join "`n"
  Yaz ''
  Write-Host ('=' * 72) -ForegroundColor DarkCyan

  $etiket = ''
  $m = [regex]::Match($metin, '\[SOZLESME_OLCUMU:([A-Z_]+)\]')
  if ($m.Success) { $etiket = $m.Groups[1].Value }

  switch ($etiket) {
    'OLCULDU'         { Yaz '  SONUC: OLCULDU - sozlesme alanlari olculdu (bkz. docs/48)' 'Green' }
    'KOSULAMADI'      { Yaz '  SONUC: KOSULAMADI - sandbox erisilemedi veya auth kanitlanamadi' 'Magenta' }
    'GUVENLIK_IHLALI' { Yaz '  SONUC: GUVENLIK IHLALI - hicbir istek gonderilmedi' 'Red' }
    default           { Yaz "  SONUC: BELIRSIZ (exit=$code) - kaydi inceleyin" 'Yellow' }
  }
  Yaz '  NOT: Bu bir PASS/FAIL karari DEGILDIR - yalniz sozlesme olcumudur.' 'DarkGray'
  Write-Host ('=' * 72) -ForegroundColor DarkCyan

  exit $code
}
finally {
  Pop-Location
}
