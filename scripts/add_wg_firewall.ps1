# XPIDER — Add WireGuard UDP 51820 to DO Cloud Firewall
# REQUIRES: $env:DO_API_TOKEN = "dop_v1_..."
# Param: -OpalWanIp "x.x.x.x" (Opal router's WAN IP) or -AllowAll for 0.0.0.0/0

param(
    [string]$OpalWanIp = "",
    [switch]$AllowAll  # Use only if Opal IP is dynamic
)

$FIREWALL_ID = "d6fd3a95-d9d9-417d-9d27-c6b57e94240a"
$doToken = $env:DO_API_TOKEN
if (-not $doToken) { Write-Host "Set DO_API_TOKEN first"; exit 1 }

$headers = @{ "Authorization" = "Bearer $doToken"; "Content-Type" = "application/json" }

if ($AllowAll) {
    $sourceAddr = "0.0.0.0/0"
    Write-Host "WARNING: Opening WireGuard to 0.0.0.0/0 (Opal IP is dynamic)" -ForegroundColor Yellow
} elseif ($OpalWanIp) {
    $sourceAddr = "$OpalWanIp/32"
    Write-Host "Adding WireGuard rule for Opal IP: $sourceAddr" -ForegroundColor Cyan
} else {
    Write-Host "Provide -OpalWanIp <ip> or -AllowAll"
    exit 1
}

$body = @{
    inbound_rules = @(@{
        protocol = "udp"
        ports = "51820"
        sources = @{ addresses = @($sourceAddr) }
    })
} | ConvertTo-Json -Depth 10

try {
    Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/firewalls/$FIREWALL_ID/rules" -Method Post -Headers $headers -Body $body -TimeoutSec 15 | Out-Null
    Write-Host "UDP 51820 rule added for $sourceAddr" -ForegroundColor Green
    Write-Host "WireGuard endpoint is now reachable from Opal."
} catch {
    Write-Host "Failed: $($_.Exception.Message)" -ForegroundColor Red
}
