# align-db-trust-network-db-fixed.ps1
# Run from project root (C:\Users\BazzM\Documents\Project Trust Incentif\trust-network)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = (Get-Location).Path
$BackupDir = Join-Path $ProjectRoot "align-db-backups"
New-Item -Path $BackupDir -ItemType Directory -Force | Out-Null

$CanonicalDb = "trust-network-db"
$ComposeFile = Join-Path $ProjectRoot "docker-compose.yml"
$EnvFile = Join-Path $ProjectRoot ".env"
$BackendServiceName = "backend"

# Backup compose and env
if (Test-Path $ComposeFile) {
    Copy-Item $ComposeFile (Join-Path $BackupDir ("docker-compose.yml.{0}.bak" -f (Get-Date -Format "yyyyMMddHHmmss"))) -Force
} else {
    Write-Host "docker-compose.yml not found in $ProjectRoot" -ForegroundColor Red
    exit 1
}
if (Test-Path $EnvFile) {
    Copy-Item $EnvFile (Join-Path $BackupDir (".env.{0}.bak" -f (Get-Date -Format "yyyyMMddHHmmss"))) -Force
}

# Read compose lines
$lines = Get-Content -LiteralPath $ComposeFile -Raw -ErrorAction Stop -Encoding UTF8
$linesArr = $lines -split "`n"

# Find Postgres service by scanning service blocks for an image line containing 'postgres'
$serviceName = $null
$currentService = $null
$currentBlock = @()
for ($i = 0; $i -lt $linesArr.Length; $i++) {
    $line = $linesArr[$i]
    if ($line -match "^\s*(\S+):\s*$") {
        # new top-level service start
        if ($currentService -ne $null) {
            $blockText = $currentBlock -join "`n"
            if ($blockText -match "(?i)image:\s*.*postgres") {
                $serviceName = $currentService
                break
            }
        }
        $currentService = $Matches[1]
        $currentBlock = @($line)
    } else {
        if ($currentService -ne $null) { $currentBlock += $line }
    }
}
# check last block if not found yet
if (-not $serviceName -and $currentService) {
    $blockText = $currentBlock -join "`n"
    if ($blockText -match "(?i)image:\s*.*postgres") { $serviceName = $currentService }
}

if (-not $serviceName) {
    # fallback to common names
    if ($lines -match "(?m)^\s*database:\s*$") { $serviceName = "database" }
    elseif ($lines -match "(?m)^\s*db:\s*$") { $serviceName = "db" }
    else { $serviceName = "database" }
}
Write-Host "Detected Postgres service: $serviceName" -ForegroundColor Cyan

# Insert or update POSTGRES_DB under that service's environment block
$updatedLines = @()
$inTargetService = $false
$serviceIndent = ""
$inserted = $false
for ($i = 0; $i -lt $linesArr.Length; $i++) {
    $line = $linesArr[$i]
    if ($line -match "^\s*${serviceName}:\s*$") {
        $inTargetService = $true
        # capture indent
        $serviceIndent = ($line -replace "([^\S\r\n]*).*",'$1')
        $updatedLines += $line
        continue
    }
    if ($inTargetService) {
        # leaving service block when we hit another top-level service
        if ($line -match "^\s*\S+:\s*$") {
            if (-not $inserted) {
                # no environment found; insert one before leaving service block
                $envIndent = $serviceIndent + "  "
                $updatedLines += "$envIndent" + "environment:"
                $updatedLines += "$envIndent" + "  POSTGRES_DB: $CanonicalDb"
                $inserted = $true
            }
            $inTargetService = $false
            $updatedLines += $line
            continue
        }

        # if we find environment: line, ensure POSTGRES_DB exists under it
        if ($line -match "^\s*environment:\s*$") {
            $updatedLines += $line
            # scan following lines to see if POSTGRES_DB exists (list or mapping)
            $j = $i + 1
            $found = $false
            while ($j -lt $linesArr.Length) {
                $next = $linesArr[$j]
                # stop if next top-level key or next service
                if ($next -match "^\s*\S+:\s*$") { break }
                # if next is another key at same or less indent than environment, break
                if ($next -match "^\s*\S" -and ($next -notmatch "^\s+-\s")) { }
                if ($next -match "(?i)POSTGRES_DB\s*[:=]") { $found = $true; break }
                if ($next -match "(?m)^\s*-\s*POSTGRES_DB\s*[:=]?\s*") { $found = $true; break }
                $j++
            }
            if (-not $found) {
                # insert a mapping style POSTGRES_DB line after the environment line
                # determine indent for env entries
                $envEntryIndent = ($line -replace "([^\S\r\n]*).*",'$1') + "  "
                $updatedLines += $envEntryIndent + "POSTGRES_DB: $CanonicalDb"
                $inserted = $true
            }
            continue
        }

        $updatedLines += $line
    } else {
        $updatedLines += $line
    }
}
# if we ended inside target service and haven't inserted yet, add environment block at end
if ($inTargetService -and -not $inserted) {
    $envIndent = $serviceIndent + "  "
    $updatedLines += $envIndent + "environment:"
    $updatedLines += $envIndent + "  POSTGRES_DB: $CanonicalDb"
    $inserted = $true
}

# Write back if changed
$newCompose = $updatedLines -join "`n"
if ($newCompose -ne $lines) {
    Set-Content -LiteralPath $ComposeFile -Value $newCompose -Force -Encoding UTF8
    Write-Host "docker-compose.yml updated (POSTGRES_DB set to $CanonicalDb)." -ForegroundColor Green
} else {
    Write-Host "docker-compose.yml already contains POSTGRES_DB for service $serviceName (no change)." -ForegroundColor Yellow
}

# Update .env DATABASE_URL last path segment if present
if (Test-Path $EnvFile) {
    $envText = Get-Content -Raw -LiteralPath $EnvFile -Encoding UTF8
    if ($envText -match "(?m)^DATABASE_URL\s*=") {
        $updatedEnv = [regex]::Replace($envText, "(?m)^(DATABASE_URL\s*=\s*.+?:\/\/.+?:.*?@.+?:\d+\/)([^`\r\n]+)", "`$1$CanonicalDb")
        if ($updatedEnv -ne $envText) {
            Set-Content -LiteralPath $EnvFile -Value $updatedEnv -Force -Encoding UTF8
            Write-Host ".env DATABASE_URL updated to use $CanonicalDb" -ForegroundColor Green
        } else {
            Write-Host "No change required in .env DATABASE_URL" -ForegroundColor Yellow
        }
    } else {
        Write-Host "No DATABASE_URL in .env; skipping .env update." -ForegroundColor Yellow
    }
} else {
    Write-Host ".env not found; skipping .env update." -ForegroundColor Yellow
}

# Recreate DB service (no volume removal)
Write-Host "Recreating DB service ($serviceName)..." -ForegroundColor Cyan
docker compose up -d --no-deps --force-recreate $serviceName | Out-Null
Start-Sleep -Seconds 6

# Find running DB container name
$container = docker ps --format "{{.Names}}\t{{.Image}}" | Select-String -Pattern $serviceName | ForEach-Object { ($_ -split "`t")[0] } | Select-Object -First 1
if (-not $container) {
    Write-Host "Could not find running container for service $serviceName. Aborting." -ForegroundColor Red
    exit 1
}
Write-Host "DB container: $container" -ForegroundColor Cyan

# Determine POSTGRES_USER from container env
$envJson = docker inspect --format='{{json .Config.Env}}' $container 2>$null
$pgUser = "postgres"
if ($envJson) {
    try {
        $envArr = $envJson | ConvertFrom-Json
        foreach ($e in $envArr) {
            if ($e -match "^POSTGRES_USER=(.+)$") { $pgUser = $Matches[1]; break }
        }
    } catch {}
}
Write-Host "Using POSTGRES_USER: $pgUser" -ForegroundColor Cyan

# Create canonical DB inside container (connect to postgres DB to ensure connection)
try {
    docker exec -i $container psql -U $pgUser -d postgres -c ("CREATE DATABASE ""{0}"";" -f $CanonicalDb) 2>$null
    Write-Host "CREATE DATABASE attempted for $CanonicalDb (errors if already exists are ignored)." -ForegroundColor Green
} catch {
    Write-Host "Warning: create DB command returned an error; continuing." -ForegroundColor Yellow
}

# Attempt common migration commands inside backend (non-fatal)
Write-Host "Attempting migrations inside backend container (failures ignored)..." -ForegroundColor Cyan
docker compose up -d --no-deps --force-recreate $BackendServiceName | Out-Null
Start-Sleep -Seconds 3
$commands = @(
    "npx prisma migrate deploy",
    "npm run migrate",
    "npx sequelize db:migrate",
    "npx knex migrate:latest --knexfile ./knexfile.js",
    "npx typeorm migration:run"
)
foreach ($cmd in $commands) {
    Write-Host "Trying: $cmd"
    try { docker compose exec $BackendServiceName sh -c $cmd 2>$null } catch {}
}

# Restart backend
Write-Host "Restarting backend..." -ForegroundColor Cyan
docker compose restart $BackendServiceName | Out-Null
Start-Sleep -Seconds 2

Write-Host "Done. Verify with:" -ForegroundColor Green
Write-Host "  docker compose ps"
Write-Host "  docker compose logs --tail 200 database"
Write-Host "  docker compose logs --tail 200 backend"
Write-Host ("  docker exec -it {0} psql -U {1} -d {2} -c '\dt'" -f $container, $pgUser, $CanonicalDb)