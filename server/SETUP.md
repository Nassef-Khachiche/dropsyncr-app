# Server Setup Guide

## Initial Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Generate Prisma Client:**
```bash
npm run prisma:generate
```

3. **Create database and run migrations:**
```bash
npm run prisma:migrate
```
When prompted, name the migration: `init`

4. **Seed the database with initial data:**
```bash
npm run prisma:seed
```

5. **Start the server:**
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

## Database Management

### View database in Prisma Studio:
```bash
npm run prisma:studio
```

### Reset database (WARNING: Deletes all data):
```bash
# Delete the database file
rm prisma/dev.db

# Run migrations again
npm run prisma:migrate

# Seed again
npm run prisma:seed
```

## Default Credentials

After seeding, you can login with:
- **Email:** admin@dropsyncr.com
- **Password:** admin123

## Troubleshooting

### Prisma Client not generated
If you see errors about Prisma Client, run:
```bash
npm run prisma:generate
```

### Database locked errors
Make sure the server is not running when running migrations. Stop the server first.

### Port already in use
Change the PORT in `.env` file or stop the process using port 5000.

