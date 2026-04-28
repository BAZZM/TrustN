Write-Host "Setting up Trust Network database..."

$container = "trust-network-db"
$dbUser    = "trustnetwork"
$dbName    = "trust_network"

Write-Host "Waiting for Postgres to be ready..."

do {
    docker exec $container pg_isready -U $dbUser | Out-Null
    Start-Sleep -Seconds 2
} until ($LASTEXITCODE -eq 0)

Write-Host "Postgres is ready."

$exists = docker exec -i $container psql `
    -U $dbUser `
    -d postgres `
    -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName';"

if ($exists.Trim() -ne "1") {
    Write-Host "Creating database $dbName"
    docker exec -i $container psql `
        -U $dbUser `
        -d postgres `
        -c "CREATE DATABASE $dbName OWNER $dbUser;"
} else {
    Write-Host "Database $dbName already exists"
}

Write-Host ""
Write-Host "Roles:"
docker exec -i $container psql -U $dbUser -d postgres -c "\du"

Write-Host ""
Write-Host "Databases:"
docker exec -i $container psql -U $dbUser -d postgres -c "\l"

Write-Host ""
Write-Host "Database setup complete."
