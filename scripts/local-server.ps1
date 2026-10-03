# Ev bilgisayarında deneme sunucusu: Postgres (kullanıcı kümesi) + web (next start) + worker (süreç içi zamanlayıcı).
# Kullanım:  powershell -ExecutionPolicy Bypass -File scripts\local-server.ps1 [start|stop|status|restart]
# Önkoşul: pnpm --filter @kaynak/web build (kod değişince yeniden). Loglar: logs\web.log, logs\worker.log
# Postgres ve log yolları KAYNAK_PG_BIN / KAYNAK_PG_DATA ile ezilebilir.
param([ValidateSet("start", "stop", "status", "restart")][string]$Action = "start")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $Root "logs"
$PidFile = Join-Path $Logs "pids.json"
$PgBin = if ($env:KAYNAK_PG_BIN) { $env:KAYNAK_PG_BIN } else { "C:\Program Files\PostgreSQL\16\bin" }
$PgData = if ($env:KAYNAK_PG_DATA) { $env:KAYNAK_PG_DATA } else { Join-Path $env:USERPROFILE "kaynak-pg\data" }
$PgLog = Join-Path (Split-Path -Parent $PgData) "postgres.log"
$Port = 3000

function Test-Pg { & "$PgBin\pg_isready.exe" -h localhost -p 5432 -q; return $LASTEXITCODE -eq 0 }

function Get-PortPid {
  $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return $c.OwningProcess } else { return $null }
}

function Stop-Tree([int]$ProcessId) { & taskkill.exe /T /F /PID $ProcessId 2>$null | Out-Null }

function Start-Pg {
  if (Test-Pg) { Write-Host "Postgres zaten açık"; return }
  # pg_ctl ayrı süreçte: bu pencere kapansa da postgres çalışmaya devam eder
  Start-Process -FilePath "$PgBin\pg_ctl.exe" -ArgumentList @("-D", "`"$PgData`"", "-l", "`"$PgLog`"", "-o", "`"-p 5432 -c listen_addresses=localhost`"", "start") -WindowStyle Hidden
  for ($i = 0; $i -lt 30; $i++) { if (Test-Pg) { Write-Host "Postgres açıldı"; return }; Start-Sleep -Seconds 1 }
  throw "Postgres 30 saniyede açılmadı; log: $PgLog"
}

function Start-Bg([string]$Name, [string]$Cmd) {
  $log = Join-Path $Logs "$Name.log"
  if (Test-Path $log) { Move-Item -Force $log "$log.1" }
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "$Cmd > `"$log`" 2>&1") -WorkingDirectory $Root -WindowStyle Hidden -PassThru
  Write-Host "$Name başladı (pid $($p.Id)), log: $log"
  return $p.Id
}

function Do-Stop {
  if (Test-Path $PidFile) {
    $pids = Get-Content $PidFile | ConvertFrom-Json
    foreach ($id in @($pids.web, $pids.worker)) { if ($id) { Stop-Tree $id } }
    Remove-Item $PidFile
  }
  # pid dosyası yoksa ya da eski bir sunucu portu tutuyorsa (ör. pnpm dev)
  $held = Get-PortPid
  if ($held) { Stop-Tree $held }
  Write-Host "web ve worker durduruldu (Postgres açık bırakıldı; kapatmak için: pg_ctl -D `"$PgData`" stop)"
}

function Do-Status {
  Write-Host ("Postgres: " + $(if (Test-Pg) { "açık" } else { "kapalı" }))
  $held = Get-PortPid
  Write-Host ("Web (:$Port): " + $(if ($held) { "açık (pid $held)" } else { "kapalı" }))
  $w = $null
  if (Test-Path $PidFile) { $w = (Get-Content $PidFile | ConvertFrom-Json).worker }
  Write-Host ("Worker: " + $(if ($w -and (Get-Process -Id $w -ErrorAction SilentlyContinue)) { "açık (pid $w)" } else { "kapalı" }))
}

function Do-Start {
  New-Item -ItemType Directory -Force -Path $Logs | Out-Null
  if (-not (Test-Path (Join-Path $Root "apps\web\.next\BUILD_ID"))) { throw "Üretim derlemesi yok: pnpm --filter @kaynak/web build" }
  Start-Pg
  if (Get-PortPid) { Write-Host "Port $Port dolu; önceki sunucu durduruluyor"; Do-Stop }
  $web = Start-Bg "web" "pnpm --filter @kaynak/web start"
  $worker = Start-Bg "worker" "pnpm --filter @kaynak/worker start"
  @{ web = $web; worker = $worker } | ConvertTo-Json | Set-Content -Encoding utf8 $PidFile
  for ($i = 0; $i -lt 60; $i++) {
    try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://localhost:$Port/"; Write-Host "Web hazır: http://localhost:$Port (HTTP $($r.StatusCode))"; return } catch { Start-Sleep -Seconds 1 }
  }
  Write-Warning "Web 60 saniyede yanıt vermedi; logs\web.log'a bakın"
}

switch ($Action) {
  "start" { Do-Start }
  "stop" { Do-Stop }
  "status" { Do-Status }
  "restart" { Do-Stop; Do-Start }
}
