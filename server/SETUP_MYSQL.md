# MySQL Setup Guide

## Prerequisites
- XAMPP installed and MySQL service running
- MySQL database created

## Step 1: Create MySQL Database

1. Open phpMyAdmin (usually at http://localhost/phpmyadmin)
2. Click "New" to create a new database
3. Name it: `dropsyncr`
4. Choose collation: `utf8mb4_unicode_ci`
5. Click "Create"

Or use MySQL command line:
```sql
CREATE DATABASE dropsyncr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## Step 2: Configure Environment Variables

Create a `.env` file in the `server` directory with:

```env
DATABASE_URL="mysql://root:@localhost:3306/dropsyncr"
PORT=5000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

**Note:** 
- If your MySQL has a password, use: `mysql://root:YOUR_PASSWORD@localhost:3306/dropsyncr`
- If using a different user: `mysql://username:password@localhost:3306/dropsyncr`
- If using a different port, change `3306` to your port

## Step 3: Install Dependencies

```bash
npm install
```

## Step 4: Generate Prisma Client

```bash
npm run prisma:generate
```

## Step 5: Run Migrations

```bash
npm run prisma:migrate
```

When prompted, name the migration: `init`

## Step 6: Seed the Database

```bash
npm run prisma:seed
```

## Step 7: Start the Server

```bash
npm start
```

Or for development:
```bash
npm run dev
```

## Troubleshooting

### Connection Refused
- Make sure MySQL service is running in XAMPP Control Panel
- Check if MySQL is running on port 3306 (default)

### Access Denied
- Check your MySQL username and password in the DATABASE_URL
- Default XAMPP MySQL user is `root` with no password

### Database Doesn't Exist
- Make sure you created the `dropsyncr` database first
- Check the database name in DATABASE_URL matches

### Prisma Client Not Generated
```bash
npm run prisma:generate
```

