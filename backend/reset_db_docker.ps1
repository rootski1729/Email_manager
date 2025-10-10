# Quick Database Reset for Docker
# Run this when your migrations are stuck or database is corrupted

Write-Host "🔄 Resetting Database (Docker)..." -ForegroundColor Yellow

# Method 1: Using Docker Compose
Write-Host "📊 Method 1: Dropping database via Docker..." -ForegroundColor Cyan

docker-compose exec postgres psql -U emailfilter -d emailfilter -c @"
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

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database cleaned" -ForegroundColor Green
} else {
    Write-Host "⚠️  If Docker is not running, use Method 2 below" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🔨 Running migrations..." -ForegroundColor Cyan
docker-compose exec backend alembic upgrade head

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migrations completed" -ForegroundColor Green
    
    Write-Host "🌱 Seeding plans..." -ForegroundColor Cyan
    docker-compose exec backend python seed_db.py
    
    Write-Host "✅ Database reset complete!" -ForegroundColor Green
} else {
    Write-Host "❌ Migration failed - check logs above" -ForegroundColor Red
}
