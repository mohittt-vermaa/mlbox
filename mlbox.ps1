<# 
.SYNOPSIS
    mlbox - CLI launcher for Windows PowerShell

.DESCRIPTION
    Four ML tools in one page: tokenizer lens, tiny playground, no-GPU recipes, live LLM prices.
    No install, no API key, no GPU, no backend.

.VERSION
    0.2.0
#>

param(
    [Parameter(Position=0, Mandatory=$false)]
    [ValidateSet('serve', 'build:desktop', 'build:apk', 'test', 'test:token', 'test:play', 'test:browser', 'fetch', 'build:tok', 'clean', 'help')]
    [string]$Command = 'help'
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

$VERSION = "0.2.0"

function Print-Banner {
    Write-Host @"
  __  __     ____ _       __  __           _   _       
 |  \/  |   / __ (_)     |  \/  |         | | (_)      
 | \  / |__| |_  | |_ __ | \  / | __ _  __| |  _ _ __  
 | |\/| / _ \__ \| | '_ \| |\/| |/ _` |/ _` | || '_ \ 
 | |  | |  __/___) | |_) | |  | | (_| | (_| | || |_) |
 |_|  |_|\___|____/| .__/|_|  |_|\__,_|\__,_|_|| .__/ 
                  | |                         | |    
                  |_|                         |_|    
" -ForegroundColor Cyan
    Write-Host "  v$VERSION — four ML tools, one page, zero deps`n" -ForegroundColor Gray
}

function Show-Usage {
    Print-Banner
    @"
Usage: .\mlbox.ps1 <command>

Commands:
  serve         Start local server (Python 3) and open browser
  build:desktop Build desktop app for Windows (creates .zip in dist/)
  build:apk     Build Android APK (requires Android SDK setup)
  test          Run all tests (tokenizer + playground)
  test:token    Run tokenizer tests only
  test:play     Run playground tests only
  test:browser  Run browser E2E tests (requires puppeteer)
  fetch         Download upstream tokenizer artifacts (~70 MB)
  build:tok     Rebuild tokenizer vocab bundles from artifacts
  clean         Remove build artifacts
  help          Show this help

Quick start:
  .\mlbox.ps1 serve          # Opens http://localhost:8000 in browser
  .\mlbox.ps1 build:desktop  # Creates dist/mlbox-v0.2.0-win32-x64.zip

Examples:
  .\mlbox.ps1 serve
  .\mlbox.ps1 build:desktop
  .\mlbox.ps1 test
"@
}

function Invoke-Serve {
    Print-Banner
    Write-Host "Starting server on http://localhost:8000 ..." -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop`n"
    
    if (Get-Command python3 -ErrorAction SilentlyContinue) {
        $server = Start-Process python3 -ArgumentList "-m", "http.server", "8000", "--bind", "0.0.0.0" -PassThru
        Start-Sleep -Milliseconds 500
        Start-Process "http://localhost:8000"
        Wait-Process -Id $server.Id
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
        $server = Start-Process python -ArgumentList "-m", "SimpleHTTPServer", "8000" -PassThru
        Start-Sleep -Milliseconds 500
        Start-Process "http://localhost:8000"
        Wait-Process -Id $server.Id
    }
    else {
        Write-Error "Python 3 not found. Install Python or use 'npx serve .'"
        exit 1
    }
}

function Invoke-BuildDesktop {
    Print-Banner
    Write-Host "Building desktop app for Windows..." -ForegroundColor Green
    if (Get-Command node -ErrorAction SilentlyContinue) {
        node scripts/build-desktop.mjs win32
    }
    else {
        Write-Error "Node.js not found. Install Node.js to build desktop app."
        exit 1
    }
}

function Invoke-BuildApk {
    Print-Banner
    Write-Host "Building Android APK..." -ForegroundColor Green
    if (-not (Test-Path ".sdk")) {
        Write-Host "Android SDK not found. Running setup first..." -ForegroundColor Yellow
        bash .sdk/setup.sh
    }
    if (Get-Command node -ErrorAction SilentlyContinue) {
        node scripts/build-apk.mjs
    }
    else {
        Write-Error "Node.js not found. Install Node.js to build APK."
        exit 1
    }
}

function Invoke-Test {
    Print-Banner
    Write-Host "Running all tests..." -ForegroundColor Green
    if (Get-Command node -ErrorAction SilentlyContinue) {
        npm test
    }
    else {
        Write-Error "Node.js not found. Install Node.js to run tests."
        exit 1
    }
}

function Invoke-TestToken {
    Print-Banner
    Write-Host "Running tokenizer tests..." -ForegroundColor Green
    if (Get-Command node -ErrorAction SilentlyContinue) {
        npm run test:tokenizer
    }
    else {
        Write-Error "Node.js not found."
        exit 1
    }
}

function Invoke-TestPlay {
    Print-Banner
    Write-Host "Running playground tests..." -ForegroundColor Green
    if (Get-Command node -ErrorAction SilentlyContinue) {
        npm run test:playground
    }
    else {
        Write-Error "Node.js not found."
        exit 1
    }
}

function Invoke-TestBrowser {
    Print-Banner
    Write-Host "Running browser E2E tests..." -ForegroundColor Green
    if (Get-Command node -ErrorAction SilentlyContinue) {
        npm run test:browser
    }
    else {
        Write-Error "Node.js not found."
        exit 1
    }
}

function Invoke-Fetch {
    Print-Banner
    Write-Host "Fetching upstream tokenizer artifacts..." -ForegroundColor Green
    if (Get-Command python3 -ErrorAction SilentlyContinue) {
        python3 tools/fetch_models.py
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
        python tools/fetch_models.py
    }
    else {
        Write-Error "Python 3 not found."
        exit 1
    }
}

function Invoke-BuildTok {
    Print-Banner
    Write-Host "Building tokenizer vocab bundles..." -ForegroundColor Green
    if (Get-Command python3 -ErrorAction SilentlyContinue) {
        python3 tools/build_tokenizers.py
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
        python tools/build_tokenizers.py
    }
    else {
        Write-Error "Python 3 not found."
        exit 1
    }
}

function Invoke-Clean {
    Print-Banner
    Write-Host "Cleaning build artifacts..." -ForegroundColor Green
    Remove-Item -Path "dist\*.zip", "dist\*.apk", "dist\SHA256SUMS.txt", "dist\RELEASE_NOTES.md" -ErrorAction SilentlyContinue -Force
    Remove-Item -Path ".sdk\build-tools", ".sdk\platforms", ".sdk\emulator" -Recurse -ErrorAction SilentlyContinue -Force
    Write-Host "Done." -ForegroundColor Green
}

# Main dispatch
switch ($Command) {
    'serve'         { Invoke-Serve }
    'build:desktop' { Invoke-BuildDesktop }
    'build:apk'     { Invoke-BuildApk }
    'test'          { Invoke-Test }
    'test:token'    { Invoke-TestToken }
    'test:play'     { Invoke-TestPlay }
    'test:browser'  { Invoke-TestBrowser }
    'fetch'         { Invoke-Fetch }
    'build:tok'     { Invoke-BuildTok }
    'clean'         { Invoke-Clean }
    'help'          { Show-Usage }
    default         { Show-Usage }
}