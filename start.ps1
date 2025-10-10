# EmailFilter Pro - Quick Start Script
# Run this script to setup and start the application

Write-Host "🚀 EmailFilter Pro - Quick Start" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "📦 Checking Docker..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    docker-compose --version | Out-Null
    Write-Host "✅ Docker is installed" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running. Please install Docker Desktop first." -ForegroundColor Red
    Write-Host "   Download from: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Navigate to backend directory
Set-Location -Path "backend"

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host ""
    Write-Host "⚙️  Setting up environment..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✅ Created .env file" -ForegroundColor Green
    
    # Generate encryption key
    Write-Host ""
    Write-Host "🔑 Generating encryption key..." -ForegroundColor Yellow
    $key = python generate_key.py
    Write-Host $key -ForegroundColor Cyan
    Write-Host ""
    Write-Host "⚠️  IMPORTANT: Copy the key above and update ENCRYPTION_KEY in .env" -ForegroundColor Red
    Write-Host "⚠️  Also update Google OAuth and SMTP credentials in .env" -ForegroundColor Red
    Write-Host ""
    
    $continue = Read-Host "Press Enter when you've updated .env (or Ctrl+C to exit)"
}

# Start Docker containers
Write-Host ""
Write-Host "🐳 Starting Docker containers..." -ForegroundColor Yellow
docker-compose up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Containers started successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to start containers" -ForegroundColor Red
    exit 1
}

# Wait for services to be ready
Write-Host ""
Write-Host "⏳ Waiting for services to be ready (10 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Run migrations
Write-Host ""
Write-Host "📊 Running database migrations..." -ForegroundColor Yellow
docker-compose exec -T backend alembic upgrade head

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migrations completed" -ForegroundColor Green
} else {
    Write-Host "⚠️  Migrations had issues (this is ok if database already exists)" -ForegroundColor Yellow
}

# Seed database
Write-Host ""
Write-Host "🌱 Seeding database with plans..." -ForegroundColor Yellow
docker-compose exec -T backend python seed_db.py

# Show status
Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "✅ EmailFilter Pro is running!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📍 Access Points:" -ForegroundColor Yellow
Write-Host "   API:          http://localhost:8000" -ForegroundColor White
Write-Host "   API Docs:     http://localhost:8000/docs" -ForegroundColor White
Write-Host "   Health:       http://localhost:8000/health" -ForegroundColor White
Write-Host "   Flower:       http://localhost:5555" -ForegroundColor White
Write-Host ""
Write-Host "📝 Useful Commands:" -ForegroundColor Yellow
Write-Host "   View logs:    docker-compose logs -f" -ForegroundColor White
Write-Host "   Stop:         docker-compose down" -ForegroundColor White
Write-Host "   Restart:      docker-compose restart" -ForegroundColor White
Write-Host ""
Write-Host "📚 Documentation:" -ForegroundColor Yellow
Write-Host "   Setup Guide:  SETUP_GUIDE.md" -ForegroundColor White
Write-Host "   README:       README.md" -ForegroundColor White
Write-Host ""

# Test health endpoint
Write-Host "🏥 Testing health endpoint..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing
    $json = $response.Content | ConvertFrom-Json
    Write-Host "✅ API is healthy!" -ForegroundColor Green
    Write-Host "   Status: $($json.status)" -ForegroundColor White
    Write-Host "   Version: $($json.version)" -ForegroundColor White
} catch {
    Write-Host "⚠️  API health check failed. It may still be starting..." -ForegroundColor Yellow
    Write-Host "   Try accessing http://localhost:8000/docs in a few seconds" -ForegroundColor White
}

Write-Host ""
Write-Host "🎉 All done! Happy coding!" -ForegroundColor Green
Write-Host ""
