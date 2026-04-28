# Trust Network - Clean Docker rebuild
# Usage:
#   .\scripts\docker-rebuild.ps1         # Rebuild and start (keeps existing DB volume)
#   .\scripts\docker-rebuild.ps1 -Reset  # Rebuild, remove volumes, then start (fresh DB)

param(
    [switch]$Reset
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if ($Reset) {
    Write-Host "Stopping and removing containers and volumes..."
    docker compose down -v
}

Write-Host "Building images (no cache)..."
docker compose build --no-cache

Write-Host "Starting services..."
docker compose up -d

Write-Host "Done. Backend: http://localhost:3000  Frontend: http://localhost:80  DB: localhost:5432"
