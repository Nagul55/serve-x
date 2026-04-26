# ServeX Fixed Subdomain Tunnel
# This script uses LocalTunnel with a fixed subdomain so your URL stays the same.

$Subdomain = "servex-nagul-bot"
$Port = 4000
$EnvFile = ".env"

Write-Host "--- Starting ServeX Tunnel ---" -ForegroundColor Cyan
Write-Host "Fixed Subdomain: $Subdomain" -ForegroundColor Cyan

# Update .env once to make sure it's correct
if (Test-Path $EnvFile) {
    $Content = Get-Content $EnvFile
    $NewContent = @()
    $TargetUrl = "https://$Subdomain.loca.lt"

    foreach ($Line in $Content) {
        if ($Line -like "SURVEX_META_WEBHOOK_URL=*") {
            $NewContent += "SURVEX_META_WEBHOOK_URL=$TargetUrl/api/survex/webhooks/whatsapp/meta"
        }
        elseif ($Line -like "SERVEX_WHATSAPP_PUBLIC_URL=*") {
            $NewContent += "SERVEX_WHATSAPP_PUBLIC_URL=$TargetUrl"
        }
        else {
            $NewContent += $Line
        }
    }
    $NewContent | Set-Content $EnvFile
    Write-Host "Success: .env updated with the fixed URL." -ForegroundColor Green
}

Write-Host "------------------------------------------------------------" -ForegroundColor Magenta
Write-Host "PERMANENT WEBHOOK URL FOR META DASHBOARD:" -ForegroundColor White
Write-Host "https://$Subdomain.loca.lt/api/survex/webhooks/whatsapp/meta" -ForegroundColor Cyan
Write-Host "------------------------------------------------------------" -ForegroundColor Magenta

Write-Host "Connecting to LocalTunnel... please wait." -ForegroundColor Yellow

# Start the tunnel
lt --port $Port --subdomain $Subdomain
