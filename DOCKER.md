# Docker Setup Guide

This guide explains how to run the Dropsyncr system using Docker.

## Prerequisites

- Docker Desktop installed and running
- Docker Compose (included with Docker Desktop)

## Quick Start

### Option 1: Full Stack (Frontend + Backend + MySQL)

```bash
docker-compose up
```

This will start:
- MySQL database on port 3306
- Backend API on port 5000
- Frontend React app on port 3000
- phpMyAdmin on port 8080

### Option 2: Backend Only (with MySQL)

If you want to run the frontend locally but use Docker for backend:

```bash
docker-compose -f docker-compose.dev.yml up
```

Then run the frontend separately:
```bash
npm install
npm run dev
```

## First Time Setup

### 1. Start the services

```bash
docker-compose up -d
```

### Access phpMyAdmin

Once the containers are running, you can access phpMyAdmin at:
- **URL**: http://localhost:8080
- **Server**: mysql (or use the IP from docker network)
- **Username**: `root` or `dropsyncr`
- **Password**: `rootpassword` or `dropsyncr` (depending on which user you choose)

### 2. Run database migrations

```bash
docker-compose exec backend npx prisma migrate dev
```

When prompted, name the migration: `init`

### 3. Seed the database

```bash
docker-compose exec backend npm run prisma:seed
```

### 4. Access the application

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- MySQL: localhost:3306
- phpMyAdmin: http://localhost:8080

## Default Credentials

After seeding:
- **Email:** admin@dropsyncr.com
- **Password:** admin123

## Docker Commands

### Start services
```bash
docker-compose up
```

### Start in background (detached)
```bash
docker-compose up -d
```

### Stop services
```bash
docker-compose down
```

### Stop and remove volumes (WARNING: Deletes database)
```bash
docker-compose down -v
```

### View logs
```bash
# All services
docker-compose logs

# Specific service
docker-compose logs backend
docker-compose logs frontend
docker-compose logs mysql
```

### Follow logs (live)
```bash
docker-compose logs -f backend
```

### Rebuild containers
```bash
docker-compose build
docker-compose up
```

### Execute commands in container
```bash
# Backend shell
docker-compose exec backend sh

# Run Prisma commands
docker-compose exec backend npx prisma studio
docker-compose exec backend npx prisma migrate dev
docker-compose exec backend npm run prisma:seed
```

## Database Access

### Connection Details
- **Host:** localhost
- **Port:** 3306
- **Database:** dropsyncr
- **Username:** dropsyncr
- **Password:** dropsyncr
- **Root Password:** rootpassword

### Using MySQL Client
```bash
docker-compose exec mysql mysql -u dropsyncr -pdropsyncr dropsyncr
```

### Using phpMyAdmin

phpMyAdmin is included in the Docker setup for easy database management.

**Access:** http://localhost:8080

**Login credentials:**
- **Username**: `root` (for full access) or `dropsyncr` (for database-specific access)
- **Password**: `rootpassword` (for root) or `dropsyncr` (for dropsyncr user)

**Features:**
- Browse and edit database tables
- Run SQL queries
- Import/Export database backups
- View table structures and relationships

**Container management:**
```bash
# View phpMyAdmin logs
docker-compose logs phpmyadmin

# Restart phpMyAdmin
docker-compose restart phpmyadmin

# Stop phpMyAdmin
docker-compose stop phpmyadmin
```

## Development Workflow

### Hot Reload (Auto-Update on Save)
Both frontend and backend support hot reload with automatic updates when you save files:

**Frontend (React/Vite):**
- ✅ Changes to `.tsx`, `.ts`, `.css` files are reflected **immediately** in the browser
- ✅ No container restart needed
- ✅ Hot Module Replacement (HMR) enabled
- ✅ File watching uses polling for Docker compatibility

**Backend (Node.js):**
- ✅ Changes to `.js` files trigger automatic server restart
- ✅ Uses `node --watch` for file watching
- ✅ No manual container restart needed
- ✅ API changes are live after auto-restart (takes ~1-2 seconds)

**How it works:**
1. Save any file in your editor
2. The container detects the change (via file watching)
3. Frontend: Browser automatically refreshes/updates
4. Backend: Server automatically restarts

**Note:** The first time you start containers, they need to build. After that, just save files and see changes instantly!

### Database Migrations
```bash
# Create new migration
docker-compose exec backend npx prisma migrate dev --name migration_name

# Apply migrations
docker-compose exec backend npx prisma migrate deploy
```

### View Database
```bash
docker-compose exec backend npx prisma studio
```

Access at: http://localhost:5555

## Troubleshooting

### Port already in use
If ports 3000, 5000, or 3306 are already in use, modify the ports in `docker-compose.yml`:

```yaml
ports:
  - "3001:3000"  # Change frontend port
  - "5001:5000"  # Change backend port
  - "3307:3306"  # Change MySQL port
```

### Database connection errors
1. Make sure MySQL container is healthy:
   ```bash
   docker-compose ps
   ```
2. Check MySQL logs:
   ```bash
   docker-compose logs mysql
   ```
3. Wait for MySQL to be ready (healthcheck passes)

### Container won't start
1. Check logs:
   ```bash
   docker-compose logs
   ```
2. Rebuild containers:
   ```bash
   docker-compose build --no-cache
   ```

### Prisma Client not generated
```bash
docker-compose exec backend npx prisma generate
```

### Reset everything
```bash
# Stop and remove everything including volumes
docker-compose down -v

# Rebuild and start
docker-compose up --build
```

## Production Build

For production, you'll want to:

1. Use production Dockerfiles (separate from dev)
2. Set proper environment variables
3. Use production database
4. Build optimized frontend

See `docker-compose.prod.yml` (create if needed) for production configuration.

