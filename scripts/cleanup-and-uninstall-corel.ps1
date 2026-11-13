#Requires -RunAsAdministrator
$ErrorActionPreference = 'SilentlyContinue'
$log = 'd:\campus-os\scripts\cleanup-log.txt'
function Log($m) {
  $line = "$(Get-Date -Format o)  $m"
  Add-Content -Path $log -Value $line
  Write-Output $line
}

Log ("Free before: {0:N2} GB" -f ((Get-PSDrive C).Free/1GB))

# --- Space cleanup ---
Log 'Cleaning Temp folders...'
Get-ChildItem $env:TEMP -Force | Remove-Item -Recurse -Force
Get-ChildItem "$env:LOCALAPPDATA\Temp" -Force | Remove-Item -Recurse -Force
Get-ChildItem 'C:\Windows\Temp' -Force | Remove-Item -Recurse -Force

Log 'Cleaning package manager caches...'
npm cache clean --force 2>$null
foreach ($p in @(
  "$env:LOCALAPPDATA\npm-cache",
  "$env:LOCALAPPDATA\pnpm",
  "$env:LOCALAPPDATA\pnpm-store",
  "$env:LOCALAPPDATA\pip\Cache",
  "$env:LOCALAPPDATA\Yarn\Cache",
  "$env:LOCALAPPDATA\NuGet\v3-cache",
  'd:\campus-os\.trash',
  'd:\campus-os\.empty_tmp',
  'd:\campus-os\student-website\node_modules',
  'd:\campus-os\student-website\_nm_tmp',
  'd:\campus-os\business-portal\node_modules'
)) {
  if (Test-Path $p) {
    Log "Removing $p"
    cmd /c "rmdir /s /q `"$p`""
  }
}

Log 'Cleaning browser caches...'
foreach ($c in @(
  "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache",
  "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Code Cache",
  "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache",
  "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Code Cache",
  "$env:LOCALAPPDATA\Discord\Cache",
  "$env:LOCALAPPDATA\Discord\Code Cache"
)) {
  if (Test-Path $c) {
    Log "Clearing $c"
    cmd /c "rmdir /s /q `"$c`""
  }
}

Log 'Emptying Recycle Bin...'
Clear-RecycleBin -Force -ErrorAction SilentlyContinue

Log 'Running Windows component cleanup (may take a few minutes)...'
Dism.exe /Online /Cleanup-Image /StartComponentCleanup /ResetBase | Out-Null

# --- CorelDRAW uninstall ---
Log 'Uninstalling CorelDRAW MSI packages...'
$pkgs = Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*, HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\* |
  Where-Object { $_.DisplayName -match 'Corel' }

foreach ($p in $pkgs) {
  $key = $p.PSChildName
  $name = $p.DisplayName
  if ($key -match '^\{[0-9A-Fa-f-]+\}$') {
    Log "msiexec /x $key ($name)"
    $proc = Start-Process msiexec.exe -ArgumentList "/x $key /qn /norestart" -Wait -PassThru
    Log "  exit=$($proc.ExitCode)"
  } else {
    Log "Non-MSI entry: $name ($key) — removing ARP registry key if orphaned"
  }
}

# Remove orphan ARP entry whose SetupARP.exe is missing
$arp = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\_{CBBC5C20-F3ED-4425-9393-F77D50036592}'
if (Test-Path $arp) {
  $setup = (Get-ItemProperty $arp -ErrorAction SilentlyContinue).UninstallString
  Log "ARP uninstall string: $setup"
  if (-not (Test-Path 'C:\Program Files\Corel\CorelDRAW Graphics Suite 2018\Setup\SetupARP.exe')) {
    Log 'Removing orphan ARP registry key for CorelDRAW Graphics Suite 2018'
    Remove-Item $arp -Recurse -Force
  }
}

Log 'Removing leftover Corel folders...'
foreach ($folder in @(
  'C:\Program Files\Corel',
  'C:\Program Files (x86)\Corel',
  'C:\ProgramData\Corel',
  "$env:APPDATA\Corel",
  "$env:LOCALAPPDATA\Corel"
)) {
  if (Test-Path $folder) {
    Log "Deleting $folder"
    cmd /c "rmdir /s /q `"$folder`""
  }
}

# Start menu / desktop shortcuts
Get-ChildItem "$env:PROGRAMDATA\Microsoft\Windows\Start Menu\Programs" -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match 'Corel' } |
  ForEach-Object { Log "Removing shortcut $($_.FullName)"; Remove-Item $_.FullName -Force -Recurse }

Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs" -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match 'Corel' } |
  ForEach-Object { Log "Removing shortcut $($_.FullName)"; Remove-Item $_.FullName -Force -Recurse }

Log '=== Remaining Corel packages ==='
Get-Package *Corel* -ErrorAction SilentlyContinue | ForEach-Object { Log $_.Name }
Log ("Free after: {0:N2} GB" -f ((Get-PSDrive C).Free/1GB))
Log 'DONE'
