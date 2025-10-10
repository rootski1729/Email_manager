# Reset Database Script
# This script drops all tables and re-runs migrations from scratch

Write-Host "🔄 Resetting Database..." -ForegroundColor Yellow

# Load environment variables
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+?)\s*=\s*(.+?)\s*$') {
            $name = $matches[1]
            $value = $matches[2] -replace '^["'']|["'']$'
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

Write-Host "📊 Dropping all tables and types..." -ForegroundColor Cyan

# PostgreSQL connection string from DATABASE_URL
$dbUrl = $env:DATABASE_URL
if (-not $dbUrl) {
    Write-Host "❌ DATABASE_URL not found in .env" -ForegroundColor Red
    exit 1
}

# Parse connection string (format: postgresql+asyncpg://user:pass@host:port/dbname)
if ($dbUrl -match 'postgresql\+asyncpg://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)') {
    $dbUser = $matches[1]
    $dbPass = $matches[2]
    $dbHost = $matches[3]
    $dbPort = $matches[4]
    $dbName = $matches[5]
    
    # Set PostgreSQL password environment variable
    $env:PGPASSWORD = $dbPass
    
    Write-Host "🗑️  Dropping all tables, enums, and sequences..." -ForegroundColor Yellow
    
    # SQL to drop everything
    $dropSql = @"
-- Drop all tables
DROP TABLE IF EXISTS filtered_emails CASCADE;
DROP TABLE IF EXISTS email_filters CASCADE;
DROP TABLE IF EXISTS connected_emails CASCADE;
DROP TABLE IF EXISTS notification_preferences CASCADE;
DROP TABLE IF EXISTS usage_metrics CASCADE;
DROP TABLE IF EXISTS user_plans CASCADE;
DROP TABLE IF EXISTS plans CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS alembic_version CASCADE;

-- Drop enum types
DROP TYPE IF EXISTS filtertype CASCADE;
DROP TYPE IF EXISTS actiontype CASCADE;
DROP TYPE IF EXISTS plantype CASCADE;
"@
    
    # Execute drop SQL
    $dropSql | & psql -h $dbHost -p $dbPort -U $dbUser -d $dbName
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Database cleaned successfully" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Some cleanup errors (may be expected if tables don't exist)" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "🔨 Running migrations..." -ForegroundColor Cyan
    alembic upgrade head
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Migrations completed successfully" -ForegroundColor Green
        
        Write-Host ""
        Write-Host "🌱 Seeding database with plans..." -ForegroundColor Cyan
        python seed_db.py
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Database seeded successfully" -ForegroundColor Green
            Write-Host ""
            Write-Host "🎉 Database reset complete!" -ForegroundColor Green
        } else {
            Write-Host "❌ Seeding failed" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ Migration failed" -ForegroundColor Red
    }
} else {
    Write-Host "❌ Invalid DATABASE_URL format" -ForegroundColor Red
    Write-Host "Expected: postgresql+asyncpg://user:pass@host:port/dbname" -ForegroundColor Yellow
    exit 1
}
