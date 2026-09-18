<#
.SYNOPSIS
  Build Pocket Money and copy the result over the installed app.

.DESCRIPTION
  The installed app under C:\Program Files holds only the compiled bundle, and
  writing there needs an elevated shell. This script self-elevates, builds, and
  replaces dist/ and electron/main.cjs in place.

  Your data is untouched: transactions live in IndexedDB under your user
  profile, not in the program folder.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1
#>

[CmdletBinding()]
param(
  [string]$Target = "C:\Program Files\Pocket Money\Pocket Money-win32-x64\resources\app",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$source = $PSScriptRoot

# Re-launch elevated if we cannot write to the target.
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "Elevation is required to write to $Target — asking for it now." -ForegroundColor Yellow
  $argList = @("-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"", "-Target", "`"$Target`"")
  if ($SkipBuild) { $argList += "-SkipBuild" }
  Start-Process powershell -Verb RunAs -ArgumentList $argList
  return
}

if (-not (Test-Path $Target)) { throw "Installed app not found at: $Target" }

if (-not $SkipBuild) {
  Write-Host "Building..." -ForegroundColor Cyan
  Push-Location $source
  try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
}

$dist = Join-Path $source "dist"
if (-not (Test-Path $dist)) { throw "No dist\ to install. Run without -SkipBuild." }

# Close the app first, or the copy fails on a locked file.
Get-Process -Name "Pocket Money" -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "Closing the running app..." -ForegroundColor Cyan
  $_.CloseMainWindow() | Out-Null
  Start-Sleep -Seconds 2
  if (-not $_.HasExited) { $_.Kill() }
}

# Keep one rollback copy beside the install.
$backup = Join-Path (Split-Path $Target -Parent) "app.backup"
if (Test-Path $backup) { Remove-Item $backup -Recurse -Force }
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item (Join-Path $Target "dist") $backup -Recurse -Force
Copy-Item (Join-Path $Target "electron") $backup -Recurse -Force
Write-Host "Previous build backed up to $backup" -ForegroundColor DarkGray

Remove-Item (Join-Path $Target "dist") -Recurse -Force
Copy-Item $dist (Join-Path $Target "dist") -Recurse -Force
Copy-Item (Join-Path $source "electron\main.cjs") (Join-Path $Target "electron\main.cjs") -Force

Write-Host "Installed to $Target" -ForegroundColor Green
Write-Host "Launch it from the Start menu or the Pocket Money shortcut." -ForegroundColor Green
