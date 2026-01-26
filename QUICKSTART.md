# Quick Start Guide for Plesk Deployment

This is a simplified guide to get Dropsyncr running on your Plesk server at dropsyncr.com.

## Prerequisites
- Plesk server with SSH access
- Docker installed
- Domain dropsyncr.com pointed to your server

## 5-Step Deployment

### 1. Upload Files to Server

Upload the entire application to:
```
/var/www/vhosts/dropsyncr.com/dropsyncr/
```

Or clone via Git:
```bash
cd /var/www/vhosts/dropsyncr.com/
git clone <your-repo> dropsyncr
cd dropsyncr
```

### 2. Configure Environment

```bash
# Copy example file
cp .env.production.example .env.production

# Edit with secure values
nano .env.production
```

**Important:** Change these values:
- `MYSQL_ROOT_PASSWORD` - Strong password (16+ characters)
- `MYSQL_PASSWORD` - Strong password (16+ characters)  
- `JWT_SECRET` - Random string (32+ characters)

### 3. Run Deployment Script

```bash
# Make script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

When asked "Do you want to seed the database?", answer **y** for first deployment.

### 4. Configure Plesk Reverse Proxy

In Plesk Panel:

1. Go to **Domains** → **dropsyncr.com** → **Apache & nginx Settings**
2. Add to **Additional nginx directives**:

```nginx
location /api/ {
    proxy_pass http://localhost:5000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

3. Click **OK** to save

### 5. Enable SSL

In Plesk Panel:

1. Go to **Domains** → **dropsyncr.com** → **SSL/TLS Certificates**
2. Click **Install** on "Let's Encrypt"
3. Check both boxes:
   - ✅ Secure the domain
   - ✅ Redirect from HTTP to HTTPS
4. Click **Get it free**

## Access Your Application

Visit: **https://dropsyncr.com**

**Default Login:**
- Email: `admin@dropsyncr.com`
- Password: `admin123`

⚠️ **CHANGE THIS PASSWORD IMMEDIATELY!**

## Common Commands

### View logs:
```bash
cd /var/www/vhosts/dropsyncr.com/dropsyncr
docker-compose -f docker-compose.prod.yml logs -f
```

### Restart application:
```bash
docker-compose -f docker-compose.prod.yml restart
```

### Stop application:
```bash
docker-compose -f docker-compose.prod.yml down
```

### Start application:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Update application:
```bash
git pull origin main
docker-compose -f docker-compose.prod.yml up -d --build
```

## Set Up Automatic Backups

```bash
# Make backup script executable
chmod +x backup.sh

# Test backup
./backup.sh

# Add to crontab (runs daily at 2 AM)
crontab -e
```

Add this line:
```
0 2 * * * cd /var/www/vhosts/dropsyncr.com/dropsyncr && ./backup.sh >> /var/log/dropsyncr-backup.log 2>&1
```

## Troubleshooting

### Containers won't start
```bash
# Check what's wrong
docker-compose -f docker-compose.prod.yml logs

# Clean restart
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml up -d --build
```

### Can't access the site
1. Check firewall allows ports 80 and 443
2. Verify nginx configuration in Plesk
3. Check container status: `docker ps`
4. Check logs: `docker-compose -f docker-compose.prod.yml logs`

### Database errors
```bash
# Check MySQL is running
docker ps | grep mysql

# Access MySQL directly
docker exec -it dropsyncr-mysql-prod mysql -u root -p
```

### Frontend can't reach backend
1. Check nginx configuration in Plesk
2. Verify `.env.production` has correct values
3. Rebuild frontend: `docker-compose -f docker-compose.prod.yml up -d --build frontend`

## Need Help?

Detailed documentation: See `DEPLOYMENT.md`

Check logs:
```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker logs dropsyncr-backend-prod
docker logs dropsyncr-frontend-prod
docker logs dropsyncr-mysql-prod
```
