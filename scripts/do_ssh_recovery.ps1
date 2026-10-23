# XPIDER SSH Recovery — DO API Diagnostics + Temporary SSH Enable
# REQUIRES: $env:DO_API_TOKEN = "dop_v1_..." (set by Owner before running)
# STRICTLY: Only touches SSH port 22 inbound rule; does NOT modify port 8443 or other rules

param(
    [switch]$DiagnoseOnly,  # Only diagnose, don't modify firewall
    [switch]$CloseSSH       # Close port 22 and cleanup (run after SSH work done)
)

$DROPLET_ID = "611293905"
$FIREWALL_ID = "d6fd3a95-d9d9-417d-9d27-c6b57e94240a"
$TARGET_IP = "143.198.40.33"
$MGMT_IP = "74.39.42.139"

$doToken = $env:DO_API_TOKEN
if (-not $doToken) {
    Write-Host "ERROR: DO_API_TOKEN environment variable not set." -ForegroundColor Red
    Write-Host "Run: `$env:DO_API_TOKEN = 'dop_v1_YOUR_TOKEN_HERE'" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $doToken"
    "Content-Type"  = "application/json"
}

Write-Host "=== XPIDER DO API RECOVERY DIAGNOSTICS ===" -ForegroundColor Cyan
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz')"
Write-Host "Management IP: $MGMT_IP"
Write-Host ""

# Droplet Status
Write-Host "--- Droplet Status (ID: $DROPLET_ID) ---" -ForegroundColor Yellow
try {
    $droplet = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/droplets/$DROPLET_ID" -Headers $headers -TimeoutSec 15
    $d = $droplet.droplet
    Write-Host "Name:    $($d.name)"
    Write-Host "Status:  $($d.status)"
    Write-Host "Region:  $($d.region.slug)"
    $pubIP = ($d.networks.v4 | Where-Object { $_.type -eq 'public' }).ip_address
    Write-Host "Pub IP:  $pubIP"
    Write-Host "Created: $($d.created_at)"
    Write-Host "Tags:    $($d.tags -join ', ')"
    if ($d.status -ne 'active') { Write-Host "WARNING: Droplet NOT active!" -ForegroundColor Red }
} catch { Write-Host "Droplet API failed: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }

# Cloud Firewall State
Write-Host ""
Write-Host "--- Cloud Firewall (ID: $FIREWALL_ID) ---" -ForegroundColor Yellow
try {
    $fw = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/firewalls/$FIREWALL_ID" -Headers $headers -TimeoutSec 15
    $f = $fw.firewall
    Write-Host "Name:    $($f.name)"
    Write-Host "Status:  $($f.status)"
    Write-Host "Droplet IDs: $($f.droplet_ids -join ', ')"
    Write-Host "Inbound Rules:"
    $sshRuleExists = $false
    $f.inbound_rules | ForEach-Object {
        $src = ($_.sources | ConvertTo-Json -Compress)
        Write-Host "  Proto=$($_.protocol) Ports=$($_.ports) Sources=$src"
        if ($_.ports -eq '22') { $sshRuleExists = $true }
    }
    Write-Host "SSH Port 22 rule present: $sshRuleExists"
} catch { Write-Host "Firewall API failed: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }

# Recent Actions
Write-Host ""
Write-Host "--- Recent Droplet Actions (last 10) ---" -ForegroundColor Yellow
try {
    $actions = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/droplets/$DROPLET_ID/actions?per_page=10" -Headers $headers -TimeoutSec 15
    $actions.actions | ForEach-Object { Write-Host "  [$($_.started_at)] $($_.type) -> $($_.status)" }
} catch { Write-Host "Actions API failed: $($_.Exception.Message)" }

if ($DiagnoseOnly) {
    Write-Host ""
    Write-Host "=== DIAGNOSE-ONLY MODE. No changes made ===" -ForegroundColor Green
    exit 0
}

if ($CloseSSH) {
    Write-Host ""
    Write-Host "--- Removing SSH Port 22 Inbound Rule ---" -ForegroundColor Yellow
    try {
        $fw2 = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/firewalls/$FIREWALL_ID" -Headers $headers -TimeoutSec 15
        $sshRules = $fw2.firewall.inbound_rules | Where-Object { $_.ports -eq '22' }
        if ($sshRules.Count -eq 0) {
            Write-Host "No SSH rule found — already closed." -ForegroundColor Green
        } else {
            $removeBody = @{ inbound_rules = @($sshRules) } | ConvertTo-Json -Depth 10
            Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/firewalls/$FIREWALL_ID/rules" -Method Delete -Headers $headers -Body $removeBody -TimeoutSec 15 | Out-Null
            Write-Host "SSH rule removed. Port 22 is now CLOSED." -ForegroundColor Green
        }
    } catch { Write-Host "Failed to remove SSH rule: $($_.Exception.Message)" -ForegroundColor Red }
    exit 0
}

# Add temporary SSH rule
Write-Host ""
Write-Host "=== OWNER APPROVAL REQUIRED ===" -ForegroundColor Red
Write-Host "This will ADD: inbound TCP port 22 from $MGMT_IP/32 ONLY."
Write-Host "Type YES to confirm:"
$confirm = Read-Host
if ($confirm -ne "YES") { Write-Host "Aborted."; exit 0 }

Write-Host "Adding SSH rule..." -ForegroundColor Yellow
try {
    $addBody = @{
        inbound_rules = @(@{
            protocol = "tcp"; ports = "22"
            sources = @{ addresses = @("$MGMT_IP/32") }
        })
    } | ConvertTo-Json -Depth 10
    Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/firewalls/$FIREWALL_ID/rules" -Method Post -Headers $headers -Body $addBody -TimeoutSec 15 | Out-Null
    Write-Host "SSH rule ADDED. Port 22 now open from $MGMT_IP/32 only." -ForegroundColor Green
    Write-Host "ssh root@$TARGET_IP" -ForegroundColor Cyan
    Write-Host "Run -CloseSSH when done to remove the port 22 rule!" -ForegroundColor Red
} catch { Write-Host "Failed to add SSH rule: $($_.Exception.Message)" -ForegroundColor Red }
