$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $repoRoot "frontend"

if (-not (Test-Path -LiteralPath $frontendDir)) {
    throw "Khong tim thay thu muc frontend tai: $frontendDir"
}

$powerShellExe = if (Get-Command pwsh -ErrorAction SilentlyContinue) {
    "pwsh"
} else {
    "powershell.exe"
}

$backendCommand = @"
Set-Location '$repoRoot'
python backend/run.py
"@

$frontendCommand = @"
Set-Location '$frontendDir'
`$env:FRONTEND_API_TARGET='http://127.0.0.1:5000'
`$env:FRONTEND_HOST='127.0.0.1'
`$env:FRONTEND_PORT='5173'
npm run dev
"@

Start-Process -FilePath $powerShellExe -ArgumentList @(
    "-NoExit",
    "-Command",
    $backendCommand
) | Out-Null

Start-Process -FilePath $powerShellExe -ArgumentList @(
    "-NoExit",
    "-Command",
    $frontendCommand
) | Out-Null

Write-Host "Da mo backend va frontend trong 2 cua so PowerShell rieng."
Write-Host "Frontend: http://localhost:5173/"
Write-Host "Backend health: http://127.0.0.1:5000/api/health"
