# Dropsyncr - Production Deployment Checklist

## Pre-Deployment Checklist

Before deploying to dropsyncr.com, ensure:

- [ ] All code is committed and pushed to repository
- [ ] `.env.production` is configured with secure passwords
- [ ] Domain DNS is pointed to server IP
- [ ] SSH access to Plesk server is available
- [ ] Docker and Docker Compose are installed on server
- [ ] Firewall allows ports 80 and 443
- [ ] Backup strategy is planned

## Deployment Files Overview

### Configuration Files
- ✅ `docker-compose.prod.yml` - Production container configuration
- ✅ `Dockerfile.prod` - Frontend production build
- ✅ `nginx.conf` - Nginx configuration for frontend
- ✅ `.env.production.example` - Environment variables template
- ✅ `.env.production` - Actual environment (DO NOT COMMIT)

### Scripts
- ✅ `deploy.sh` - Automated deployment script
- ✅ `backup.sh` - Database backup script

### Documentation
- ✅ `DEPLOYMENT.md` - Complete deployment guide
- ✅ `QUICKSTART.md` - Quick 5-step guide for Plesk
- ✅ `DOCKER.md` - Docker development guide

## Quick Commands Reference

### Deployment
```bash
# First time deployment
./deploy.sh

# Update existing deployment
git pull && docker-compose -f docker-compose.prod.yml up -d --build
```

### Container Management
```bash
# Start containers
docker-compose -f docker-compose.prod.yml up -d

# Stop containers
docker-compose -f docker-compose.prod.yml down

# Restart containers
docker-compose -f docker-compose.prod.yml restart

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Check status
docker-compose -f docker-compose.prod.yml ps
```

### Database Operations
```bash
# Run migrations
docker exec dropsyncr-backend-prod npx prisma migrate deploy

# Seed database
docker exec dropsyncr-backend-prod npm run prisma:seed

# Backup database
./backup.sh

# Restore database
gunzip < backup.sql.gz | docker exec -i dropsyncr-mysql-prod mysql -u root -p dropsyncr
```

### Monitoring
```bash
# View all logs
docker-compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker logs -f dropsyncr-backend-prod
docker logs -f dropsyncr-frontend-prod
docker logs -f dropsyncr-mysql-prod

# Check container resource usage
docker stats
```

## Security Checklist

After deployment:

- [ ] Change default admin password
- [ ] Verify strong database passwords in `.env.production`
- [ ] SSL certificate installed and working
- [ ] HTTP redirects to HTTPS
- [ ] Firewall configured properly
- [ ] Regular backups scheduled
- [ ] Database not exposed to public internet
- [ ] Update system packages: `sudo apt update && sudo apt upgrade`

## Performance Checklist

- [ ] CDN configured (optional, e.g., Cloudflare)
- [ ] Database indexes optimized
- [ ] Gzip compression enabled (already in nginx.conf)
- [ ] Static asset caching configured (already in nginx.conf)
- [ ] Container resource limits set if needed

## Maintenance Tasks

### Daily
- Monitor application logs for errors
- Check container health: `docker ps`

### Weekly
- Review backup logs
- Check disk space: `df -h`
- Review error logs in Plesk

### Monthly
- Update system packages
- Review and rotate logs
- Test backup restoration
- Update application dependencies

## Backup Strategy

### Automated Backups
```bash
# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * cd /var/www/vhosts/dropsyncr.com/dropsyncr && ./backup.sh
```

### Manual Backup
```bash
cd /var/www/vhosts/dropsyncr.com/dropsyncr
./backup.sh
```

Backups are stored in: `/var/backups/dropsyncr/`
Retention: 7 days (configurable in backup.sh)

## Rollback Procedure

If something goes wrong:

```bash
# 1. Stop current containers
docker-compose -f docker-compose.prod.yml down

# 2. Restore from backup
gunzip < /var/backups/dropsyncr/dropsyncr_YYYYMMDD_HHMMSS.sql.gz | \
    docker exec -i dropsyncr-mysql-prod mysql -u root -p dropsyncr

# 3. Revert to previous code version
git checkout <previous-commit>

# 4. Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build
```

## Monitoring URLs

After deployment, these should work:

- https://dropsyncr.com - Frontend application
- https://dropsyncr.com/api/health - Backend health check (if implemented)

## Support Contacts

- Documentation: See DEPLOYMENT.md and QUICKSTART.md
- Logs: `docker-compose -f docker-compose.prod.yml logs`
- Plesk Support: https://support.plesk.com/
- Docker Documentation: https://docs.docker.com/

## Post-Deployment Testing

Test these features:

- [ ] Login with admin credentials
- [ ] Create a new user
- [ ] Add an integration
- [ ] Create test order
- [ ] Export orders to Excel
- [ ] Check all dashboard metrics
- [ ] Test on mobile devices
- [ ] Verify SSL certificate

## Environment Variables Reference

Required in `.env.production`:

```bash
# Database (REQUIRED)
MYSQL_ROOT_PASSWORD=<strong-password-16+-chars>
MYSQL_PASSWORD=<strong-password-16+-chars>

# Authentication (REQUIRED)
JWT_SECRET=<random-string-32+-chars>

# Application (REQUIRED)
NODE_ENV=production
DOMAIN=dropsyncr.com
FRONTEND_URL=https://dropsyncr.com
BACKEND_URL=https://dropsyncr.com/api
```

## Troubleshooting Guide

See DEPLOYMENT.md "Troubleshooting" section for:
- Container startup issues
- Database connection errors
- Frontend/backend communication issues
- SSL certificate problems
- Performance optimization

## Version Information

- Node.js: 18.x
- MySQL: 8.0
- Nginx: Alpine (latest)
- Docker Compose: 3.8

## License & Credits

Dropsyncr © 2026 - All rights reserved
