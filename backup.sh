#!/bin/bash

# Dropsyncr Backup Script
# Creates backups of the database and stores them in /var/backups/dropsyncr

set -e

# Configuration
BACKUP_DIR="/var/backups/dropsyncr"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# Load environment variables
if [ -f .env.production ]; then
    source .env.production
else
    echo "Error: .env.production not found"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

echo "🔄 Starting Dropsyncr backup..."
echo "Date: $(date)"
echo ""

# Backup MySQL database
echo "📦 Backing up MySQL database..."
docker exec dropsyncr-mysql-prod mysqldump \
    -u root \
    -p$MYSQL_ROOT_PASSWORD \
    --single-transaction \
    --quick \
    --lock-tables=false \
    dropsyncr | gzip > $BACKUP_DIR/dropsyncr_$DATE.sql.gz

BACKUP_SIZE=$(du -h $BACKUP_DIR/dropsyncr_$DATE.sql.gz | cut -f1)
echo "✅ Database backup created: dropsyncr_$DATE.sql.gz ($BACKUP_SIZE)"
echo ""

# Clean up old backups
echo "🧹 Cleaning up old backups (keeping last $RETENTION_DAYS days)..."
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
REMAINING=$(ls -1 $BACKUP_DIR/*.sql.gz 2>/dev/null | wc -l)
echo "✅ Cleanup complete. $REMAINING backup(s) remaining."
echo ""

# List all backups
echo "📋 Available backups:"
ls -lh $BACKUP_DIR/*.sql.gz 2>/dev/null || echo "No backups found"
echo ""

echo "✅ Backup complete!"
