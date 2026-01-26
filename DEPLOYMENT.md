# Dropsyncr Production Deployment Guide

## Prerequisites for Plesk Server

1. **Server Requirements:**
   - Linux server with Plesk Panel
   - Docker & Docker Compose installed
   - Domain: dropsyncr.com pointed to your server IP
   - SSL certificate (Let's Encrypt recommended)
   - Minimum 2GB RAM, 2 CPU cores
   - 20GB disk space

2. **Plesk Extensions Needed:**
   - Docker extension (if not already installed)
   - Or SSH access to install Docker manually

## Step 1: Prepare Your Server

### Install Docker on Plesk (if not installed)

SSH into your server and run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add your user to docker group
sudo usermod -aG docker $USER
```

## Step 2: Upload Application to Server

### Option A: Using Git (Recommended)

```bash
# SSH into your server
cd /var/www/vhosts/dropsyncr.com/

# Clone your repository
git clone <your-repo-url> dropsyncr
cd dropsyncr
```

### Option B: Using FTP/SFTP

1. Upload the entire application folder to `/var/www/vhosts/dropsyncr.com/dropsyncr/`
2. SSH into server and navigate to the folder

## Step 3: Configure Environment Variables

Create a `.env.production` file in the root directory:

```bash
nano .env.production
```

Add the following (replace with your secure values):

```env
# MySQL Configuration
MYSQL_ROOT_PASSWORD=your_secure_root_password_here
MYSQL_PASSWORD=your_secure_db_password_here

# Backend Configuration
JWT_SECRET=your_very_secure_jwt_secret_at_least_32_characters_long
NODE_ENV=production

# Domain Configuration
DOMAIN=dropsyncr.com
FRONTEND_URL=https://dropsyncr.com
BACKEND_URL=https://dropsyncr.com/api
```

## Step 4: Build and Start the Application

```bash
# Make sure you're in the application directory
cd /var/www/vhosts/dropsyncr.com/dropsyncr

# Build and start containers
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

## Step 5: Run Database Migrations

```bash
# Run Prisma migrations
docker exec dropsyncr-backend-prod npx prisma migrate deploy

# Seed initial data (admin user, etc.)
docker exec dropsyncr-backend-prod npm run prisma:seed
```

## Step 6: Configure Nginx Reverse Proxy in Plesk

### Option A: Using Plesk Panel

1. Go to Plesk > Domains > dropsyncr.com > Apache & nginx Settings
2. Add the following to **Additional nginx directives**:

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

### Option B: Manual Nginx Configuration

Create `/etc/nginx/sites-available/dropsyncr.conf`:

```nginx
server {
    listen 80;
    server_name dropsyncr.com www.dropsyncr.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dropsyncr.com www.dropsyncr.com;

    ssl_certificate /etc/letsencrypt/live/dropsyncr.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dropsyncr.com/privkey.pem;

    # API routes
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
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/dropsyncr.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Step 7: Configure SSL Certificate

### Using Plesk:
1. Go to Domains > dropsyncr.com > SSL/TLS Certificates
2. Install free Let's Encrypt certificate
3. Enable "Secure the domain" and "Redirect from HTTP to HTTPS"

### Using Certbot manually:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d dropsyncr.com -d www.dropsyncr.com
```

## Step 8: Update Frontend API Configuration

The frontend needs to know where the API is. Update the API base URL:

Edit `src/services/api.ts` to use relative URLs or environment-based URLs:

```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
```

Create `.env.production` in the root (for frontend):
```env
VITE_API_URL=/api
```

Rebuild the frontend container:
```bash
docker-compose -f docker-compose.prod.yml up -d --build frontend
```

## Step 9: Set Up Auto-Start on Reboot

```bash
# Create systemd service
sudo nano /etc/systemd/system/dropsyncr.service
```

Add:
```ini
[Unit]
Description=Dropsyncr Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/var/www/vhosts/dropsyncr.com/dropsyncr
ExecStart=/usr/local/bin/docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable the service:
```bash
sudo systemctl enable dropsyncr.service
sudo systemctl start dropsyncr.service
```

## Step 10: Configure Firewall

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# If using Plesk firewall, configure through panel
```

## Step 11: Set Up Backups

### Database Backup Script

Create `backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/dropsyncr"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup MySQL
docker exec dropsyncr-mysql-prod mysqldump -u root -p$MYSQL_ROOT_PASSWORD dropsyncr | gzip > $BACKUP_DIR/dropsyncr_$DATE.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete
```

Make executable and add to cron:
```bash
chmod +x backup.sh
crontab -e
# Add: 0 2 * * * /var/www/vhosts/dropsyncr.com/dropsyncr/backup.sh
```

## Default Admin Credentials

After seeding the database:
- **Email:** admin@dropsyncr.com
- **Password:** admin123

**IMPORTANT:** Change the admin password immediately after first login!

## Monitoring and Logs

### View container logs:
```bash
# All containers
docker-compose -f docker-compose.prod.yml logs -f

# Specific container
docker logs -f dropsyncr-backend-prod
docker logs -f dropsyncr-frontend-prod
docker logs -f dropsyncr-mysql-prod
```

### Check container status:
```bash
docker ps
docker-compose -f docker-compose.prod.yml ps
```

### Restart containers:
```bash
# All containers
docker-compose -f docker-compose.prod.yml restart

# Specific container
docker restart dropsyncr-backend-prod
```

## Updating the Application

```bash
cd /var/www/vhosts/dropsyncr.com/dropsyncr

# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build

# Run any new migrations
docker exec dropsyncr-backend-prod npx prisma migrate deploy
```

## Troubleshooting

### Issue: Containers won't start
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs

# Remove and rebuild
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml up -d --build
```

### Issue: Database connection errors
```bash
# Check MySQL is running
docker ps | grep mysql

# Test database connection
docker exec dropsyncr-mysql-prod mysql -u root -p$MYSQL_ROOT_PASSWORD -e "SHOW DATABASES;"
```

### Issue: Frontend can't reach backend
- Check nginx configuration
- Verify firewall rules
- Check browser console for CORS errors
- Ensure API_BASE_URL is correct

## Performance Optimization

### 1. Enable Redis caching (Optional)
Add to docker-compose.prod.yml:
```yaml
redis:
  image: redis:alpine
  container_name: dropsyncr-redis
  restart: always
  networks:
    - dropsyncr-network
```

### 2. Configure MySQL for production
Edit MySQL configuration in docker-compose.prod.yml:
```yaml
command: --default-authentication-plugin=mysql_native_password --max_connections=200
```

### 3. Set up CDN for static assets
- Use Cloudflare or similar CDN
- Configure in Plesk DNS settings

## Security Checklist

- [ ] Changed default admin password
- [ ] Strong MySQL passwords set
- [ ] JWT_SECRET is random and secure (32+ characters)
- [ ] SSL certificate installed and working
- [ ] HTTP redirects to HTTPS
- [ ] Firewall configured
- [ ] Regular backups scheduled
- [ ] Docker containers running as non-root (where possible)
- [ ] Environment variables stored securely
- [ ] Database not exposed to public internet

## Support

For issues or questions, check:
- Application logs: `docker-compose logs`
- Nginx error logs: `/var/log/nginx/error.log`
- System logs: `journalctl -xe`
