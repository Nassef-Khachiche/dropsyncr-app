# Dropsyncr System

A comprehensive dropshipping and fulfillment management system with a React frontend and Node.js/Express backend.

## Project Structure

- `src/` - React frontend application
- `server/` - Node.js Express backend server with Prisma ORM

## Quick Start with Docker

The easiest way to run the entire stack:

```bash
# Start all services (MySQL + Backend + Frontend)
docker-compose up

# Or run in background
docker-compose up -d
```

Then:
1. Run migrations: `docker-compose exec backend npx prisma migrate dev`
2. Seed database: `docker-compose exec backend npm run prisma:seed`
3. Access: http://localhost:3000

See [DOCKER.md](./DOCKER.md) for detailed Docker instructions.

## Setup Instructions

### Option 1: Docker (Recommended)

See [DOCKER.md](./DOCKER.md) for complete Docker setup instructions.

### Option 2: Local Development

#### Prerequisites
- Node.js 18+ installed
- npm or yarn
- MySQL 8.0+ (or use XAMPP)

### Backend Setup

1. Navigate to the server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Set up the database:
```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations to create database
npm run prisma:migrate

# Seed the database with initial data
npm run prisma:seed
```

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The backend will run on `http://localhost:5000`

### Frontend Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## Default Login Credentials

- **Email:** admin@dropsyncr.com
- **Password:** admin123

## Development

Run both frontend and backend simultaneously:

1. Terminal 1 (Backend):
```bash
cd server
npm run dev
```

2. Terminal 2 (Frontend):
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/verify` - Verify token
- `GET /api/auth/profiles` - Get user profiles

### Orders
- `GET /api/orders` - Get all orders
- `GET /api/orders/:id` - Get order by ID
- `POST /api/orders` - Create order
- `PUT /api/orders/:id` - Update order
- `DELETE /api/orders/:id` - Delete order

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get product by ID
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product
- `POST /api/products/bulk-update-stock` - Bulk update stock

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

### Tracking
- `GET /api/tracking` - Get all trackings
- `POST /api/tracking` - Create tracking
- `POST /api/tracking/bulk` - Bulk create trackings

### Carriers
- `GET /api/carriers` - Get all carriers
- `POST /api/carriers` - Create carrier
- `PUT /api/carriers/:id` - Update carrier
- `DELETE /api/carriers/:id` - Delete carrier

### Tickets
- `GET /api/tickets` - Get all tickets
- `GET /api/tickets/:id` - Get ticket by ID
- `POST /api/tickets` - Create ticket
- `POST /api/tickets/:id/messages` - Add message to ticket
- `PUT /api/tickets/:id` - Update ticket

## Features

- User authentication with JWT
- Secure login/logout
- Protected routes
- Session persistence
- Order management
- Product/Inventory management
- Tracking management
- Carrier management
- Support ticket system
- Dashboard with analytics
- Multi-profile/store support

## Database

The application uses MySQL with Prisma ORM.

To view the database:
```bash
cd server
npm run prisma:studio
```

Or with Docker:
```bash
docker-compose exec backend npx prisma studio
```

## Notes

- All API endpoints (except `/api/auth/login` and `/api/health`) require authentication
- JWT tokens expire after 24 hours
- CORS is configured to allow requests from `http://localhost:3000`
- The database is seeded with sample data on first setup
