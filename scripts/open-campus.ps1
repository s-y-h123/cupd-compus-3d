param(
  [ValidateRange(1024, 65530)][int]$StartPort = 4301,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sitePath = '/cupd-compus-3d/'
Set-Location -LiteralPath $projectRoot

function Test-CampusSite([int]$port) {
  try {
    $address = "http://127.0.0.1:$port$($sitePath)data/models.json"
    $response = Invoke-WebRequest -UseBasicParsing -Uri $address -TimeoutSec 3
    return $response.StatusCode -eq 200 -and $response.Content.Contains('models/cupb/campus.glb')
  } catch {
    return $false
  }
}

function Test-PortOccupied([int]$port) {
  $connection = New-Object System.Net.Sockets.TcpClient
  try {
    $connection.Connect('127.0.0.1', $port)
    return $true
  } catch {
    return $false
  } finally {
    $connection.Dispose()
  }
}

try {
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  $version = & $node --version
  if ($LASTEXITCODE -ne 0 -or [int]($version -replace '^v(\d+).*$', '$1') -lt 22) {
    throw 'Node.js 22 or newer is required.'
  }

  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\vinext'))) {
    Write-Host 'Installing project dependencies (first launch only)...'
    & $npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
  }

  Write-Host 'Building the latest campus page...'
  & $npm run build:pages
  if ($LASTEXITCODE -ne 0) { throw 'Campus page build failed.' }
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'out\index.html'))) {
    throw 'The generated campus page is missing.'
  }

  $ports = $StartPort..($StartPort + 4)
  $port = $null
  for ($pass = 0; $pass -lt 3 -and $null -eq $port; $pass++) {
    foreach ($candidate in $ports) {
      if (Test-CampusSite $candidate) { $port = $candidate; break }
    }
    if ($null -eq $port) { Start-Sleep -Milliseconds 500 }
  }
  if ($null -eq $port) {
    foreach ($candidate in $ports) {
      if (-not (Test-PortOccupied $candidate)) { $port = $candidate; break }
    }
    if ($null -eq $port) { throw 'Ports 4301-4305 are already in use.' }
    $env:PORT = [string]$port
    $server = Start-Process -FilePath $node -ArgumentList 'scripts/preview.mjs' `
      -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
      if (Test-CampusSite $port) { $ready = $true; break }
      if ($server.HasExited) { break }
      Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw "Local preview did not start on port $port." }
  }

  $address = "http://127.0.0.1:$port$sitePath"
  Write-Host "Opening $address"
  if (-not $NoBrowser) { Start-Process $address }
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
