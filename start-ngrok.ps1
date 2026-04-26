# ServeX Ngrok Launcher
# Starts an ngrok tunnel for the local backend on port 4000.

$NgrokToken = $env:NGROK_AUTHTOKEN
if (-not $NgrokToken) {
    $NgrokToken = $env:NGROK_TOKEN
}

Write-Host "Starting ServeX ngrok tunnel..." -ForegroundColor Cyan

if ($NgrokToken) {
    Write-Host "Configuring ngrok token..."
    & ngrok config add-authtoken $NgrokToken
} else {
    Write-Host "NGROK_AUTHTOKEN/NGROK_TOKEN not set. Continuing with existing ngrok config." -ForegroundColor Yellow
}

$DomainArg = ""
if ($args.Count -gt 0) {
    $Domain = $args[0]
    $DomainArg = "--domain=$Domain"
    Write-Host "Using static domain: $Domain" -ForegroundColor Green
} else {
    Write-Host "Tip: pass a static ngrok domain as the first argument if you have one." -ForegroundColor Yellow
}

Write-Host "Opening tunnel to port 4000..."
& ngrok http 4000 $DomainArg --host-header="localhost:4000"
