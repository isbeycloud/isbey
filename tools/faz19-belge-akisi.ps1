<#
  ISBEY CLOUD — FAZ 19 GERCEK BELGE AKISI KOSUSU (TEST/SANDBOX)
  =============================================================
  AMAC
    Belge yasam dongusunun (olustur -> GONDER -> sorgula -> IPTAL -> sorgula)
    MEVCUT uygulama kodu ve MEVCUT API sozlesmesiyle gercek TEST/SANDBOX
    ortaminda calisip calismadigini KANITLAMAK.

  NEDEN AYRI BIR SARMALAYICI
    `phase19DocumentLifecycleTest.ts` gonderim/iptal adimlarini bilincli olarak
    SKIP eder (kontor tuketme riski) ve bu yuzden o suit ASLA PASS donmez.
    Bu betik o sinirlamayi AYRI ve ACIK bir onayla asar; guvenlik kapisi
    aynen korunur.

  KOSUM (proje kokunde, PowerShell):
    powershell -ExecutionPolicy Bypass -File tools\faz19-belge-akisi.ps1

  ON KOSULLAR (hepsi saglanmazsa betik HICBIR ISTEK GONDERMEDEN durur):
    · .env icinde HIZLI_BILISIM_IS_TEST_MODE=true
    · .env icinde HIZLI_BILISIM_ALLOW_PROD bos veya false
    · .env icinde HIZLI_BILISIM_API_URL => econnecttest hostu
    · .env icinde test SecretKey / ApiKey / WS kullanici+sifre / VKN tanimli

  KONTOR UYARISI
    Bu kosu GERCEK belge gonderir ve IPTAL eder. Satici dokumani (docs/21 §8)
    test ortaminda kontorun tuketilip tuketilmedigini BELGELEMEZ. Bu yuzden
    "test ortami kontor yakmaz" VARSAYILMAZ; kosu oncesi ve sonrasi bakiye
    OKUNUR ve fark RAPORLANIR. Kosu baslamadan once bu acikca ekrana yazilir.

  CIKTI
    .verify-tmp\faz19-gercek-akis-<zaman>.txt   <- tam kosu kaydi
    .verify-tmp\faz19-gercek-akis-kanit-*.json  <- adim adim HTTP kaniti
#>

[CmdletBinding()]
param(
  # Kontor tuketme riskini kabul ettigini acikca beyan et.
  # Verilmezse betik gonderim YAPMADAN durur (kuru kosu degil — hic kosmaz).
  [switch]$KontorOnayi
)

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
$Kayit = Join-Path $Tmp "faz19-gercek-akis-$damga.txt"

function Yaz { param([string]$M, [string]$R = 'Gray') Write-Host $M -ForegroundColor $R }

Push-Location $Root
try {
  Write-Host ('=' * 72) -ForegroundColor DarkCyan
  Write-Host '  ISBEY CLOUD — FAZ 19 GERCEK BELGE AKISI KOSUSU (TEST/SANDBOX)' -ForegroundColor Cyan
  Write-Host ('=' * 72) -ForegroundColor DarkCyan

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

  $isTest   = EnvAl 'HIZLI_BILISIM_IS_TEST_MODE'
  $allowProd = EnvAl 'HIZLI_BILISIM_ALLOW_PROD'
  $apiUrl   = EnvAl 'HIZLI_BILISIM_API_URL'
  $apiKey   = EnvAl 'HIZLI_BILISIM_API_KEY'
  $secretKey = EnvAl 'HIZLI_BILISIM_SECRET_KEY'
  $wsUser   = EnvAl 'HIZLI_BILISIM_WS_USERNAME'
  $wsPass   = EnvAl 'HIZLI_BILISIM_WS_PASSWORD'
  $vkn      = (EnvAl 'HIZLI_BILISIM_VKN') -replace '\D', ''

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
    Yaz "  [FAIL] HIZLI_BILISIM_API_URL TEST hostunu gostermiyor" 'Red'; $hata = $true
  } else { Yaz '  [OK]   API URL => TEST/SANDBOX' 'Green' }

  if ($apiUrl -like "*$CANLI_HOST*") {
    Yaz '  [FAIL] HIZLI_BILISIM_API_URL canli host iceriyor' 'Red'; $hata = $true
  } else { Yaz '  [OK]   API URL canli host icermiyor' 'Green' }

  $credTam = ($apiKey -and $secretKey -and $wsUser -and $wsPass)
  if (-not $credTam) {
    # Hangi alanin eksik oldugunu soyle ama DEGER YAZMA
    $eksik = @()
    if (-not $apiKey) { $eksik += 'API_KEY' }
    if (-not $secretKey) { $eksik += 'SECRET_KEY' }
    if (-not $wsUser) { $eksik += 'WS_USERNAME' }
    if (-not $wsPass) { $eksik += 'WS_PASSWORD' }
    Yaz "  [FAIL] Sandbox credential eksik: $($eksik -join ', ')" 'Red'; $hata = $true
  } else { Yaz '  [OK]   Sandbox credential tanimli (degerler yazdirilmaz)' 'Green' }

  if (-not $vkn) {
    Yaz '  [WARN] HIZLI_BILISIM_VKN tanimsiz - kontor sorgusu atlanacak' 'Yellow'
  } else { Yaz '  [OK]   VKN tanimli' 'Green' }

  if ($hata) {
    Yaz ''
    Yaz '  ⛔ ON KOSULLAR SAGLANMADI - hicbir istek GONDERILMEDI.' 'Red'
    exit 1
  }

  # ------------------------------------------------------------ 2. ONAY
  Yaz ''
  Yaz '2. KONTOR ONAYI' 'Cyan'
  if (-not $KontorOnayi) {
    Yaz ''
    Yaz '  BU KOSU GERCEK BELGE GONDERIR VE IPTAL EDER.' 'Yellow'
    Yaz '  Satici dokumani test ortaminda kontorun tuketilip tuketilmedigini' 'Yellow'
    Yaz '  BELGELEMEZ. Kontor tuketme riski KABUL EDILMEDEN kosu yapilmaz.' 'Yellow'
    Yaz ''
    Yaz '  Kosmak icin:  powershell -ExecutionPolicy Bypass -File tools\faz19-belge-akisi.ps1 -KontorOnayi' 'White'
    Yaz ''
    Yaz '  ⛔ Onay verilmedi - hicbir istek GONDERILMEDI.' 'Red'
    exit 2
  }
  Yaz '  [OK]   Kontor riski bu kosu icin kabul edildi (-KontorOnayi)' 'Green'

  # ------------------------------------------------------------ 3. KOSUM
  Yaz ''
  Yaz '3. KOSUM' 'Cyan'

  # tsx cagri yolu - dogrulama paketiyle AYNI guvenilirlik sirasi:
  #   1) node --import tsx                    (node.exe dogrudan; tirnak riski yok)
  #   2) node node_modules/tsx/dist/cli.mjs   (yedek-1)
  #   3) cmd /c npx tsx                       (yedek-2; son care)
  $Node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $Node) { Yaz '  [FAIL] node bulunamadi (PATH)' 'Red'; exit 1 }
  Yaz "  [OK]   node: $Node" 'Green'

  $tsxCli = Join-Path $Root 'node_modules\tsx\dist\cli.mjs'
  $hedef  = 'server/tests/phase19DocumentSendFlowRun.ts'

  # 1) node --import tsx destekleniyor mu? (surum + tsx modulu varligi)
  #    Node 20.6+ '--import' bayragini destekler; tsx kurulu olmalidir.
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
    Yaz '  [WARN] tsx bulunamadi - npx ile denenecek (tirnak riski var)' 'Yellow'
    $exe = (Get-Command cmd -ErrorAction SilentlyContinue).Source
    if (-not $exe) { Yaz '  [FAIL] ne tsx ne cmd bulunamadi' 'Red'; exit 1 }
    $argList = @('/c', 'npx', 'tsx', $hedef)
  }

  $env:FAZ19_GONDERIM_ONAY = 'EVET'
  $env:ISBEY_REPO_ROOT = $Root

  $raw = Join-Path $Tmp "faz19-raw-out-$damga.txt"
  $rawErr = Join-Path $Tmp "faz19-raw-err-$damga.txt"

  $proc = Start-Process -FilePath $exe -ArgumentList $argList `
            -WorkingDirectory $Root -PassThru -WindowStyle Hidden `
            -RedirectStandardOutput $raw -RedirectStandardError $rawErr

  if (-not $proc.WaitForExit(600 * 1000)) {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }
    Yaz '  [FAIL] Kosu 10 dakikada tamamlanmadi — surec olduruldu' 'Red'
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
    'KOSU CIKTISI BOS — betik hicbir sey yazmadi.' | Set-Content -Path $Kayit -Encoding UTF8
    $satirlar = @('KOSU CIKTISI BOS — betik hicbir sey yazmadi.')
  }

  Write-Host (($satirlar -join "`n"))
  Yaz ''
  Yaz "  Kosu kaydi: $Kayit" 'DarkGray'

  # ------------------------------------------------------------ 4. KARAR
  $metin = $satirlar -join "`n"
  Yaz ''
  Write-Host ('=' * 72) -ForegroundColor DarkCyan

  # Karar, ASCII'ye dayanikli makine etiketinden okunur (Turkce karakter
  # kodlamasi bozulsa bile yanlis karar verilmez). Etiket yoksa metne bakilir.
  $etiket = ''
  $m = [regex]::Match($metin, '\[FAZ19_KARAR:([A-Z_]+)\]')
  if ($m.Success) { $etiket = $m.Groups[1].Value }

  switch ($etiket) {
    'PASS'            { Yaz '  KARAR: PASS - gercek sandbox belge yasam dongusu dogrulandi' 'Green' }
    'FAIL'            { Yaz '  KARAR: FAIL - gercek sandbox islemi hata verdi' 'Red' }
    'GUVENLIK_IHLALI' { Yaz '  KARAR: FAIL - guvenlik kapisi ihlali' 'Red' }
    'KOSULAMADI'      { Yaz '  KARAR: KOSULAMADI - gercek sandbox erisilemedi veya zincir tamamlanmadi' 'Magenta' }
    default {
      if ($metin -match 'KARAR:\s*PASS') { Yaz '  KARAR: PASS (metinden okundu)' 'Green' }
      elseif ($metin -match 'KARAR:\s*FAIL') { Yaz '  KARAR: FAIL (metinden okundu)' 'Red' }
      else { Yaz "  KARAR: BELIRSIZ (exit=$code) - kaydi inceleyin" 'Yellow' }
    }
  }
  Write-Host ('=' * 72) -ForegroundColor DarkCyan

  exit $code
}
finally {
  Pop-Location
  Remove-Item Env:\FAZ19_GONDERIM_ONAY -ErrorAction SilentlyContinue
}
