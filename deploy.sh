#!/bin/bash

# Dropsyncr Production Deployment Script
# This script automates the deployment process

set -e  # Exit on any error

echo "🚀 Dropsyncr Production Deployment"
echo "=================================="
echo ""

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "❌ Error: .env.production file not found!"
    echo "Please copy .env.production.example to .env.production and configure it."
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed!"
    echo "Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Error: Docker Compose is not installed!"
    echo "Please install Docker Compose first."
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Step 1: Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.prod.yml --env-file .env.production down || true
echo "✅ Containers stopped"
echo ""

# Step 2: Build and start containers
echo "🏗️  Building containers..."
docker-compose -f docker-compose.prod.yml --env-file .env.production build --no-cache
echo "✅ Build complete"
echo ""

echo "🚀 Starting containers..."
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
echo "✅ Containers started"
echo ""

# Step 3: Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10
echo "✅ Database should be ready"
echo ""

# Step 4: Run database migrations
echo "📊 Running database migrations..."
docker exec dropsyncr-backend-prod npx prisma migrate deploy
echo "✅ Migrations complete"
echo ""

# Step 5: Seed database (optional, only on first deployment)
read -p "Do you want to seed the database with initial data? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🌱 Seeding database..."
    docker exec dropsyncr-backend-prod npm run prisma:seed
    echo "✅ Database seeded"
    echo ""
    echo "📝 Default admin credentials:"
    echo "   Email: admin@dropsyncr.com"
    echo "   Password: admin123"
    echo "   ⚠️  CHANGE THIS PASSWORD IMMEDIATELY!"
    echo ""
fi

# Step 6: Show container status
echo "📊 Container Status:"
docker-compose -f docker-compose.prod.yml ps
echo ""

# Step 7: Show logs (last 20 lines)
echo "📋 Recent logs:"
docker-compose -f docker-compose.prod.yml logs --tail=20
echo ""

echo "✅ Deployment complete!"
echo ""
echo "🌐 Your application should be accessible at:"
echo "   Frontend: http://localhost:3000 (or your domain)"
echo "   Backend API: http://localhost:5000/api"
echo ""
echo "📝 Next steps:"
echo "   1. Configure your reverse proxy (Nginx/Apache) in Plesk"
echo "   2. Set up SSL certificate"
echo "   3. Test the application"
echo "   4. Change default admin password"
echo ""
echo "📖 For detailed instructions, see DEPLOYMENT.md"
