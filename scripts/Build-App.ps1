#requires -Version 5.1
param(
 [switch]$CI
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$started = $false
try {
 if (![Environment]::Is64BitOperatingSystem) { throw 'Нужна Windows 10/11 x64.' }
 $build = [int](Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').CurrentBuildNumber
 if ($build -lt 10240) { throw 'Windows 7/8 не поддерживается. Нужна Windows 10/11 x64.' }
 if (Get-Process Volna,LADO,Sozvuk,VKPolka,Fonoteka,VKSound -ErrorAction SilentlyContinue) { throw 'Закройте VKSound / LADO / Volna перед сборкой.' }
 $appVersion = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
 Write-Host "VKSound $appVersion — сборка приложения и установщика"
 Write-Host 'Python, py и системная установка компилятора не нужны.'
 Write-Host 'Node.js, Electron, библиотеки и портативный NSIS загружаются в папку проекта. Нужен интернет.'
 Write-Host 'Вход в VK выполняется только в окне приложения после сборки, не в консоли.'
 if ($CI) {
  Write-Host 'Режим CI: подтверждение сборки не требуется.'
 } elseif ((Read-Host 'Начать? [y/N]') -ne 'y') {
  exit 0
 }
 Start-Transcript -LiteralPath (Join-Path $root 'build-gui.log') -Force | Out-Null
 $started = $true
 [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
 $tools = Join-Path $root '.tools'
 New-Item -ItemType Directory -Force -Path $tools | Out-Null
 $nsisVersion = '3.13'
 $nsisDir = Join-Path $tools ("nsis-{0}" -f $nsisVersion)
 $nsisZip = Join-Path $tools ("nsis-{0}.zip" -f $nsisVersion)
 $nsisHash = 'ba63dffc4410ee89193e1cb5a41989991bd77c61068da17e3156d136b7b0b3d8'
 $nsisUrls = @(
  'https://downloads.sourceforge.net/project/nsis/NSIS%203/3.13/nsis-3.13.zip'
  'https://sourceforge.net/projects/nsis/files/NSIS%203/3.13/nsis-3.13.zip/download'
 )
 $makensis = Join-Path $nsisDir 'Bin\makensis.exe'
 $muiInclude = Join-Path $nsisDir 'Contrib\Modern UI 2\MUI2.nsh'
 if (!(Test-Path -LiteralPath $makensis) -or !(Test-Path -LiteralPath $muiInclude)) {
  Write-Host "Подготавливаем портативный NSIS $nsisVersion в .tools (без системной установки)…"
  if (Test-Path -LiteralPath $nsisDir) { Remove-Item -LiteralPath $nsisDir -Recurse -Force }
  if (Test-Path -LiteralPath $nsisZip) {
   if ((Get-FileHash -LiteralPath $nsisZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $nsisHash) {
    Remove-Item -LiteralPath $nsisZip -Force
   }
  }
  if (!(Test-Path -LiteralPath $nsisZip)) {
   $nsisReady = $false
   $nsisFailures = @()
   $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
   foreach ($url in $nsisUrls) {
    if ($nsisReady) { break }
    try {
     if (Test-Path -LiteralPath $nsisZip) { Remove-Item -LiteralPath $nsisZip -Force }
     if ($curl) {
      Write-Host "Загрузка NSIS через curl.exe: $url"
      & $curl.Source --fail --location --silent --show-error --retry 2 --connect-timeout 30 --max-time 600 --output $nsisZip $url
      if ($LASTEXITCODE -ne 0) { throw "curl.exe завершился с кодом $LASTEXITCODE" }
     } else {
      Write-Host "Загрузка NSIS через Windows PowerShell: $url"
      Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $nsisZip -TimeoutSec 600 -MaximumRedirection 10
     }
     $actualHash = (Get-FileHash -LiteralPath $nsisZip -Algorithm SHA256).Hash.ToLowerInvariant()
     if ($actualHash -eq $nsisHash) {
      $nsisReady = $true
     } else {
      $size = (Get-Item -LiteralPath $nsisZip).Length
      Remove-Item -LiteralPath $nsisZip -Force
      $nsisFailures += "SHA-256 не совпал ($actualHash; $size байт)"
     }
    } catch {
     $nsisFailures += $_.Exception.Message
     if (Test-Path -LiteralPath $nsisZip) { Remove-Item -LiteralPath $nsisZip -Force }
    }
   }
   if (!$nsisReady) {
    $details = $nsisFailures -join '; '
    throw "Не удалось получить проверенный архив NSIS. Ожидаемый SHA-256: $nsisHash. Попробуйте другую сеть или проверьте прокси/антивирус. Подробности: $details"
   }
  }
  Expand-Archive -LiteralPath $nsisZip -DestinationPath $tools -Force
 }
 if (!(Test-Path -LiteralPath $makensis) -or !(Test-Path -LiteralPath $muiInclude)) { throw 'Не удалось подготовить портативный NSIS. Удалите папку .tools\nsis-3.13 и повторите сборку.' }
 $env:NSISDIR = $nsisDir
 $nodeDir = $null
 # Reuse the previously verified portable runtime before contacting nodejs.org.
 foreach ($local in (Get-ChildItem -LiteralPath $tools -Directory -Filter 'node-v24.*-win-x64' | Sort-Object Name -Descending)) {
  $localExe = Join-Path $local.FullName 'node.exe'
  $localNpm = Join-Path $local.FullName 'npm.cmd'
  if (!(Test-Path -LiteralPath $localExe) -or !(Test-Path -LiteralPath $localNpm)) {
   Write-Host "Пропускаем неполный локальный Node.js: $($local.FullName)"
   continue
  }
  $localInfo = & $localExe -p 'process.versions.node.split(String.fromCharCode(46))[0]+String.fromCharCode(32)+process.arch'
  if ($LASTEXITCODE -eq 0 -and $localInfo -eq '24 x64') { $nodeDir = $local.FullName; $npm = $localNpm; break }
 }
 $candidate = Get-Command node.exe -ErrorAction SilentlyContinue
 if (!$nodeDir -and $candidate) {
  $candidateDir = Split-Path -Parent $candidate.Source
  $candidateNpm = Join-Path $candidateDir 'npm.cmd'
  if (!(Test-Path -LiteralPath $candidateNpm)) {
   Write-Host "Node.js из PATH пропущен: рядом не найден npm.cmd ($candidateDir)."
  } else {
   $version = & $candidate.Source -p 'process.versions.node.split(String.fromCharCode(46))[0]'
   $arch = & $candidate.Source -p 'process.arch'
   if ($LASTEXITCODE -eq 0 -and [int]$version -ge 24 -and $arch -eq 'x64') { $nodeDir = $candidateDir; $npm = $candidateNpm }
  }
 }
 if (!$nodeDir) {
  $base = 'https://nodejs.org/dist/latest-v24.x/'
  Write-Host 'Получаем официальный Node.js 24 LTS x64 и список контрольных сумм…'
  $sums = [string](Invoke-WebRequest -UseBasicParsing -Uri ($base+'SHASUMS256.txt') -TimeoutSec 120).Content
  $entry = $null
  foreach ($line in ($sums -split '\r?\n')) {
   $match = [regex]::Match($line,'^([a-fA-F0-9]{64})\s+(node-v24\.\d+\.\d+-win-x64\.zip)$')
   if ($match.Success) { $entry = $match; break }
  }
  if ($null -eq $entry) { throw 'В официальном списке не найден Node.js 24 Windows x64.' }
  $hash = $entry.Groups[1].Value
  $filename = $entry.Groups[2].Value
  $archive = Join-Path $tools $filename
  $nodeDir = Join-Path $tools ([IO.Path]::GetFileNameWithoutExtension($filename))
  $nodeExe = Join-Path $nodeDir 'node.exe'
  $npm = Join-Path $nodeDir 'npm.cmd'
  if (!(Test-Path -LiteralPath $nodeExe) -or !(Test-Path -LiteralPath $npm)) {
   # A prior interrupted extraction can leave node.exe without npm.cmd.
   # Remove the partial directory so Expand-Archive cannot preserve stale files.
   if (Test-Path -LiteralPath $nodeDir) { Remove-Item -LiteralPath $nodeDir -Recurse -Force }
   if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
   Invoke-WebRequest -UseBasicParsing -Uri ($base+$filename) -OutFile $archive -TimeoutSec 600
   if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $hash) { Remove-Item -LiteralPath $archive -Force; throw 'Контрольная сумма Node.js не совпала. Файл не запущен.' }
   Expand-Archive -LiteralPath $archive -DestinationPath $tools -Force
  }
  if (!(Test-Path -LiteralPath $nodeExe)) { throw 'В официальном архиве Node.js не найден node.exe.' }
  if (!(Test-Path -LiteralPath $npm)) { throw 'В официальном архиве Node.js не найден npm.cmd. Удалите папку .tools и повторите сборку.' }
 }
 if (!$nodeDir -or !$npm -or !(Test-Path -LiteralPath $npm)) { throw 'Не удалось найти совместимую пару Node.js и npm.cmd. Удалите папку .tools и повторите сборку.' }
 Write-Host "Используем Node.js и npm из: $nodeDir"
 $env:PATH = $nodeDir+';'+$env:PATH
 $env:npm_config_cache = Join-Path $tools 'npm-cache'
 # Process-local settings only: do not alter the user's npm/proxy/TLS configuration.
 $env:npm_config_fetch_retries = '2'
 $env:npm_config_fetch_retry_mintimeout = '2000'
 $env:npm_config_fetch_retry_maxtimeout = '15000'
 $env:npm_config_fetch_timeout = '60000'
 $env:ELECTRON_CACHE = Join-Path $tools 'electron-cache'
 Write-Host '[1/5] Проверяем уже установленные зависимости (без сети)…'
 & (Join-Path $nodeDir 'node.exe') (Join-Path $PSScriptRoot 'dependencies-ready.cjs')
 if ($LASTEXITCODE -ne 0) {
  Write-Host '[1/5] Устанавливаем Electron, HLS и редактор ресурсов Windows.'
  Write-Host 'Подробности HTTP-запросов будут ниже. Electron загрузится при необходимости.'
  # Electron's large runtime is downloaded later, not in a silent npm postinstall.
  # No npm ci: it deletes an existing node_modules on every rebuild.
  & $npm install --ignore-scripts --prefer-offline --no-audit --no-fund --progress=true --loglevel=http
  if ($LASTEXITCODE -ne 0) {
   Write-Host 'При ECONNRESET/ETIMEDOUT попробуйте другую сеть или проверьте ваш VPN/прокси. Кеш сохранён.' -ForegroundColor Yellow
   throw 'Не удалось загрузить зависимости. Повторите Build-App.cmd; тройного полного повтора больше нет.'
  }
 } else {
  Write-Host '[1/5] Зависимости уже есть — установка npm пропущена.'
 }
 Write-Host '[2/5] Локальные автотесты…'
 & $npm test
 if ($LASTEXITCODE -ne 0) { throw 'Автотесты не прошли. Сборка остановлена.' }
 Write-Host '[3/5] Electron: загрузка только при отсутствии готовой версии; затем локальная упаковка…'
 & $npm run build:app
 if ($LASTEXITCODE -ne 0) { throw 'Упаковка приложения не выполнена. Смотрите строки выше.' }
 $folder = Join-Path $root 'artifacts\win-unpacked'
 $exe = Join-Path $folder 'VKSound.exe'
 if (!(Test-Path -LiteralPath $exe)) { throw 'Файл VKSound.exe не найден после сборки.' }
 Write-Host '[4/5] Проверяем запуск Electron и IPC без обращения к VK…'
 $process = Start-Process -FilePath $exe -ArgumentList '--smoke-test' -PassThru
 if (!$process.WaitForExit(30000)) { $process.Kill(); throw 'Проверка запуска не завершилась за 30 секунд.' }
 $process.Refresh()
 if ($process.ExitCode -ne 0) { throw 'Проверка запуска приложения не прошла.' }
 Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination (Join-Path $folder 'VKSOUND-LICENSE.txt') -Force
 Copy-Item -LiteralPath (Join-Path $root 'COPYRIGHT') -Destination $folder -Force
 Copy-Item -LiteralPath (Join-Path $root 'THIRD-PARTY.txt') -Destination $folder -Force
 $hlsLicense = Join-Path $root 'node_modules\hls.js\LICENSE'
 if (Test-Path -LiteralPath $hlsLicense) { Copy-Item -LiteralPath $hlsLicense -Destination (Join-Path $folder 'HLS-LICENSE.txt') -Force }
 $setup = Join-Path $root ("artifacts\VKSound-Setup-{0}.exe" -f $appVersion)
 if (Test-Path -LiteralPath $setup) { Remove-Item -LiteralPath $setup -Force }
 Write-Host "[5/5] Компилируем установщик портативным NSIS $nsisVersion…"
 & $makensis ("/DAPP_VERSION={0}" -f $appVersion) (Join-Path $root 'installer.nsi')
 if ($LASTEXITCODE -ne 0) { throw 'NSIS не смог скомпилировать установщик.' }
 if (!(Test-Path -LiteralPath $setup)) { throw 'Файл установщика не найден после компиляции.' }
 Write-Host "Готовый установщик: $setup"
 Write-Host "Готовая папка приложения (переносимая версия): $folder"
 Stop-Transcript | Out-Null
 $started = $false
 if (!$CI) { Invoke-Item -LiteralPath (Join-Path $root 'artifacts') }
 exit 0
} catch {
 Write-Host ('Ошибка: '+$_.Exception.Message) -ForegroundColor Red
 if ($started) { Stop-Transcript | Out-Null }
 exit 1
}
