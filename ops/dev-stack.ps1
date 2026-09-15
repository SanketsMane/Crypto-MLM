<#
.SYNOPSIS
  Start, stop and inspect Postgres and Redis for local development on Windows.

.DESCRIPTION
  `docker compose up` is the documented way to run the datastores, and it is
  still the right one wherever Docker is available. This script exists for a
  machine where it is not: no Docker, no WSL distro, no administrator rights,
  and therefore no service registration and no container runtime.

  Both servers are installed per-user under %LOCALAPPDATA%\Programs and run as
  ordinary user processes on the same ports the compose file publishes — 5440
  and 6390 — so `.env` needs no change either way, and switching back to Docker
  later is just `docker compose up -d` instead of this.

  Postgres additionally carries an app-local copy of the MSVC runtime in its
  bin directory. The machine has no Visual C++ redistributable and installing
  one needs administrator rights; app-local CRT deployment is a supported
  Microsoft model and keeps the whole install inside the user profile.

.PARAMETER Action
  start | stop | status | logs

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File ops\dev-stack.ps1 start
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'status', 'logs')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'

$PgHome    = Join-Path $env:LOCALAPPDATA 'Programs\pgsql'
$PgData    = Join-Path $env:LOCALAPPDATA 'fortunex-pgdata'
$RedisHome = Join-Path $env:LOCALAPPDATA 'Programs\redis'
$RedisData = Join-Path $env:LOCALAPPDATA 'fortunex-redisdata'
$LogDir    = Join-Path $env:LOCALAPPDATA 'fortunex-logs'

$PgPort    = 5440
$RedisPort = 6390

# The log must NOT live inside the data directory. Postgres walks its own data
# directory during crash recovery, hits the log file that pg_ctl is holding
# open, and stalls on a sharing violation for thirty seconds before failing.
$PgLog    = Join-Path $LogDir 'postgres.log'
$RedisLog = Join-Path $LogDir 'redis.log'

function Test-Port([int]$Port) {
  $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-Stack {
  New-Item -ItemType Directory -Force -Path $LogDir, $RedisData | Out-Null

  if (Test-Port $PgPort) {
    Write-Host "postgres  already listening on $PgPort"
  } else {
    Start-Process -FilePath (Join-Path $PgHome 'bin\pg_ctl.exe') `
      -ArgumentList '-D', "`"$PgData`"", '-l', "`"$PgLog`"", '-o', "`"-p $PgPort`"", 'start' `
      -WindowStyle Hidden
    Write-Host "postgres  starting on $PgPort ..."
  }

  if (Test-Port $RedisPort) {
    Write-Host "redis     already listening on $RedisPort"
  } else {
    Start-Process -FilePath (Join-Path $RedisHome 'redis-server.exe') `
      -ArgumentList '--port', $RedisPort, '--bind', '127.0.0.1', '--dir', "`"$RedisData`"",
                    '--save', '900 1', '--appendonly', 'no', '--logfile', "`"$RedisLog`"" `
      -WindowStyle Hidden
    Write-Host "redis     starting on $RedisPort ..."
  }

  # Postgres replays WAL before accepting connections, so readiness is polled
  # rather than assumed after a fixed sleep.
  foreach ($i in 1..30) {
    Start-Sleep -Seconds 1
    & (Join-Path $PgHome 'bin\pg_isready.exe') -h 127.0.0.1 -p $PgPort -q 2>$null
    if ($LASTEXITCODE -eq 0) { break }
  }
  Get-Status
}

function Stop-Stack {
  if (Test-Path $PgData) {
    Start-Process -FilePath (Join-Path $PgHome 'bin\pg_ctl.exe') `
      -ArgumentList '-D', "`"$PgData`"", '-m', 'fast', 'stop' -WindowStyle Hidden -Wait
    Write-Host 'postgres  stopped'
  }
  Get-Process redis-server -ErrorAction SilentlyContinue | Stop-Process -Force
  Write-Host 'redis     stopped'
}

function Get-Status {
  Write-Host ''
  Write-Host '  service   port   state'
  Write-Host '  --------  -----  -----'

  $pgUp = Test-Port $PgPort
  if ($pgUp) {
    & (Join-Path $PgHome 'bin\pg_isready.exe') -h 127.0.0.1 -p $PgPort -q 2>$null
    $pgUp = $LASTEXITCODE -eq 0
  }
  Write-Host ("  postgres  {0}   {1}" -f $PgPort, $(if ($pgUp) { 'accepting connections' } else { 'DOWN' }))

  $rUp = $false
  if (Test-Port $RedisPort) {
    $reply = & (Join-Path $RedisHome 'redis-cli.exe') -h 127.0.0.1 -p $RedisPort ping 2>$null
    $rUp = "$reply".Trim() -eq 'PONG'
  }
  Write-Host ("  redis     {0}   {1}" -f $RedisPort, $(if ($rUp) { 'PONG' } else { 'DOWN' }))
  Write-Host ''
}

function Get-Logs {
  foreach ($pair in @(@{ n = 'postgres'; p = $PgLog }, @{ n = 'redis'; p = $RedisLog })) {
    Write-Host "--- $($pair.n) ---"
    if (Test-Path $pair.p) { Get-Content $pair.p -Tail 20 } else { Write-Host '(no log yet)' }
    Write-Host ''
  }
}

switch ($Action) {
  'start'  { Start-Stack }
  'stop'   { Stop-Stack }
  'status' { Get-Status }
  'logs'   { Get-Logs }
}
