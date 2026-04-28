# auto-apply-compose-fix.ps1
# Backs up docker-compose.yml, merges duplicate environment blocks for the Postgres service,
# ensures POSTGRES_DB is set to "trust-network-db", recreates the DB service, creates the DB,
# attempts common migrations inside backend, and restarts backend.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = (Get-Location).Path
$ComposePath = Join-Path $ProjectRoot "docker-compose.yml"
$EnvPath = Join-Path $ProjectRoot ".env"
$BackupDir = Join-Path $ProjectRoot "compose-fix-backups"
New-Item -Path $BackupDir -ItemType Directory -Force | Out-Null

if (-not (Test-Path $ComposePath)) {
    Write-Host "docker-compose.yml not found in current directory." -ForegroundColor Red
    exit 1
}

# Backup compose
$ts = (Get-Date).ToString("yyyyMMddHHmmss")
$composeBak = Join-Path $BackupDir ("docker-compose.yml.bak.$ts")
Copy-Item -LiteralPath $ComposePath -Destination $composeBak -Force
Write-Host "Backed up docker-compose.yml -> $composeBak" -ForegroundColor Cyan

# Read file and split into lines
$raw = Get-Content -LiteralPath $ComposePath -Raw -Encoding UTF8
$lines = $raw -split "`n"

# Detect Postgres service name (prefer database, db; else find service with image containing 'postgres')
$serviceName = $null
if ($raw -match "(?m)^\s*database:\s*$") { $serviceName = "database" }
elseif ($raw -match "(?m)^\s*db:\s*$") { $serviceName = "db" }
else {
    $currentService = $null; $currentBlock = @()
    for ($i=0; $i -lt $lines.Length; $i++) {
        $l = $lines[$i]
        if ($l -match "^\s*(\S+):\s*$") {
            if ($currentService -ne $null) {
                $blockText = $currentBlock -join "`n"
                if ($blockText -match "(?i)image:\s*.*postgres") { $serviceName = $currentService; break }
            }
            $currentService = $Matches[1]; $currentBlock = @($l)
        } else { if ($currentService) { $currentBlock += $l } }
    }
    if (-not $serviceName -and $currentService) {
        $blockText = $currentBlock -join "`n"
        if ($blockText -match "(?i)image:\s*.*postgres") { $serviceName = $currentService }
    }
}

if (-not $serviceName) {
    Write-Host "Could not detect Postgres service automatically. Edit docker-compose.yml manually." -ForegroundColor Red
    exit 1
}
Write-Host "Target Postgres service: $serviceName" -ForegroundColor Green

# Locate service block start and end
$startIdx = -1
for ($i=0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match "^\s*${serviceName}:\s*$") { $startIdx = $i; break }
}
if ($startIdx -lt 0) { Write-Host "Service block not found." -ForegroundColor Red; exit 1 }
$endIdx = $lines.Length - 1
for ($i = $startIdx + 1; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match "^\s*\S+:\s*$") {
        $indent = ($lines[$i] -replace "([^\S\r\n]*).*",'$1')
        if ($indent.Length -eq 0) { $endIdx = $i - 1; break }
    }
}

$serviceBlock = $lines[$startIdx..$endIdx]

# Find all environment blocks inside the service block
$envBlocks = @()
for ($i=0; $i -lt $serviceBlock.Length; $i++) {
    if ($serviceBlock[$i] -match "^\s*environment:\s*$") {
        $s = $i
        $j = $i + 1
        while ($j -lt $serviceBlock.Length) {
            $next = $serviceBlock[$j]
            if ($next -match "^\s*\S+:\s*$") { break }
            $j++
        }
        $e = $j - 1
        $envBlocks += ,@{ start = $s; end = $e; lines = $serviceBlock[$s..$e] }
        $i = $e
    }
}

# If only one or none, ensure POSTGRES_DB exists; otherwise merge duplicates
$canonicalDb = "trust-network-db"
if ($envBlocks.Count -le 1) {
    # ensure POSTGRES_DB present; if not, insert under environment or create environment block
    if ($envBlocks.Count -eq 1) {
        $envLines = $envBlocks[0].lines
        $found = $false
        for ($k=1; $k -lt $envLines.Length; $k++) {
            if ($envLines[$k] -match "(?i)POSTGRES_DB\s*[:=]") { $found = $true; break }
            if ($envLines[$k] -match "(?i)-\s*POSTGRES_DB") { $found = $true; break }
        }
        if (-not $found) {
            # insert after environment header
            $insertIdx = $startIdx + $envBlocks[0].start + 1
            $indent = ($serviceBlock[$envBlocks[0].start] -replace "([^\S\r\n]*).*",'$1') + "  "
            $lines = $lines[0..($insertIdx-1)] + @($indent + "POSTGRES_DB: " + $canonicalDb) + $lines[$insertIdx..($lines.Length-1)]
            Write-Host "Inserted POSTGRES_DB under existing environment block." -ForegroundColor Green
        } else {
            Write-Host "POSTGRES_DB already present in environment block." -ForegroundColor Yellow
        }
    } else {
        # no environment block: insert one after service header
        $insertIdx = $startIdx + 1
        $indent = ($lines[$startIdx] -replace "([^\S\r\n]*).*",'$1') + "  "
        $envBlockLines = @(
            $indent + "environment:",
            $indent + "  POSTGRES_DB: " + $canonicalDb
        )
        $lines = $lines[0..($insertIdx-1)] + $envBlockLines + $lines[$insertIdx..($lines.Length-1)]
        Write-Host "Added new environment block with POSTGRES_DB." -ForegroundColor Green
    }
} else {
    # Merge multiple environment blocks
    $entries = @{}
    foreach ($b in $envBlocks) {
        $blockLines = $b.lines
        for ($k = 1; $k -lt $blockLines.Length; $k++) {
            $ln = $blockLines[$k].Trim()
            if ($ln -eq "") { continue }
            if ($ln -match "^\-\s*(.+)$") {
                $payload = $Matches[1].Trim()
                if ($payload -match "^(.*?)=(.*)$") { $key = $Matches[1].Trim(); $val = $Matches[2].Trim() }
                elseif ($payload -match "^(.*?):\s*(.*)$") { $key = $Matches[1].Trim(); $val = $Matches[2].Trim() }
                else { continue }
            } elseif ($ln -match "^(.*?):\s*(.*)$") {
                $key = $Matches[1].Trim(); $val = $Matches[2].Trim()
            } elseif ($ln -match "^(.*?)=(.*)$") {
                $key = $Matches[1].Trim(); $val = $Matches[2].Trim()
            } else { continue }
            if (-not $entries.ContainsKey($key)) { $entries[$key] = $val }
        }
    }
    # ensure POSTGRES_DB present
    if (-not $entries.ContainsKey("POSTGRES_DB")) { $entries["POSTGRES_DB"] = $canonicalDb }

    # build new mapping-style environment block
    $envHeaderLine = $serviceBlock[$envBlocks[0].start]
    $envHeaderIndent = ($envHeaderLine -replace "([^\S\r\n]*).*",'$1')
    $newEnv = @()
    $newEnv += $envHeaderIndent + "environment:"
    foreach ($k in $entries.Keys) {
        $newEnv += $envHeaderIndent + "  " + $k + ": " + $entries[$k]
    }

    # construct new service block: replace first env block with newEnv and remove other env blocks
    $firstStart = $envBlocks[0].start
    $firstEnd = $envBlocks[0].end
    $skipRanges = @()
    foreach ($b in $envBlocks) { $skipRanges += ,@($b.start, $b.end) }

    $sbNew = @()
    for ($i=0; $i -lt $serviceBlock.Length; $i++) {
        if ($i -eq $firstStart) {
            $sbNew += $newEnv
            $i = $firstEnd
            continue
        }
        $inSkip = $false
        foreach ($r in $skipRanges) { if ($i -gt $r[0] -and $i -le $r[1]) { $inSkip = $true; break } }
        if ($inSkip) { continue }
        $sbNew += $serviceBlock[$i]
    }

    # replace service block in original lines
    $newLines = @()
    for ($i=0; $i -lt $startIdx; $i++) { $newLines += $lines[$i] }
    $newLines += $sbNew
    for ($i=$endIdx+1; $i -lt $lines.Length; $i++) { $newLines += $lines[$i] }
    $lines = $newLines
    Write-Host "Merged multiple environment blocks into a single mapping and ensured POSTGRES_DB." -ForegroundColor Green
}

# Write updated compose file
$newContent = $lines -join "`n"
Set-Content -LiteralPath $ComposePath -Value $newContent -Encoding UTF8 -Force
Write-Host "Wrote corrected docker-compose.yml (backup at $composeBak)." -ForegroundColor Green

# Recreate DB service
Write-Host "Recreating DB service ($serviceName)..." -ForegroundColor Cyan
docker compose up -d --no-deps --force-recreate $serviceName | Out-Null
Start-Sleep -Seconds 6

# Find running DB container name
$container = docker ps --format "{{.Names}}\t{{.Image}}" | Select-String -Pattern $serviceName | ForEach-Object { ($_ -split "`t")[0] } | Select-Object -First 1
if (-not $container) {
    Write-Host "Could not find running container for service $serviceName. Aborting DB creation step." -ForegroundColor Red
    exit 1
}
Write-Host "DB container: $container" -ForegroundColor Cyan

# Determine POSTGRES_USER
$envJson = docker inspect --format='{{json .Config.Env}}' $container 2>$null
$pgUser = "postgres"
if ($envJson) {
    try { $envArr = $envJson | ConvertFrom-Json; foreach ($e in $envArr) { if ($e -match "^POSTGRES_USER=(.+)$") { $pgUser = $Matches[1]; break } } } catch {}
}
Write-Host "Using POSTGRES_USER: $pgUser" -ForegroundColor Cyan

# Create canonical DB inside container (connect to postgres DB)
try {
    docker exec -i $container psql -U $pgUser -d postgres -c ("CREATE DATABASE ""{0}"";" -f $canonicalDb) 2>$null
    Write-Host "CREATE DATABASE attempted for $canonicalDb (errors if already exists are ignored)." -ForegroundColor Green
} catch { Write-Host "Warning: create DB command returned an error; continuing." -ForegroundColor Yellow }

# Attempt migrations inside backend (non-fatal)
Write-Host "Attempting common migration commands inside backend (failures ignored)..." -ForegroundColor Cyan
docker compose up -d --no-deps --force-recreate backend | Out-Null
Start-Sleep -Seconds 3
$cmds = @("npx prisma migrate deploy","npm run migrate","npx sequelize db:migrate","npx knex migrate:latest --knexfile ./knexfile.js","npx typeorm migration:run")
foreach ($c in $cmds) {
    Write-Host "Trying: $c"
    try { docker compose exec backend sh -c $c 2>$null } catch {}
}

# Restart backend
Write-Host "Restarting backend..." -ForegroundColor Cyan
docker compose restart backend | Out-Null
Start-Sleep -Seconds 2

Write-Host "Auto-apply complete. Verify with:" -ForegroundColor Green
Write-Host "  docker compose ps"
Write-Host "  docker compose logs --tail 200 $serviceName"
Write-Host "  docker compose logs --tail 200 backend"
Write-Host ("  docker exec -it {0} psql -U {1} -d {2} -c '\dt'" -f $container, $pgUser, $canonicalDb)