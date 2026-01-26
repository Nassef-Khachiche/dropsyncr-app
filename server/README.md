# Dropsyncr Server

Node.js Express server with authentication for the Dropsyncr application.

## Setup

1. Install dependencies:
```bash
cd server
npm install
```

2. Create a `.env` file (optional, defaults are provided):
```env
PORT=5000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### POST /api/auth/login
Login endpoint for user authentication.

**Request Body:**
```json
{
  "email": "admin@dropsyncr.com",
  "password": "admin123"
}
```

**Response:**
```json
{
  "token": "jwt-token-here",
  "user": {
    "id": 1,
    "email": "admin@dropsyncr.com",
    "name": "Admin User"
  }
}
```

### GET /api/auth/verify
Verify JWT token validity.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "email": "admin@dropsyncr.com",
    "name": "Admin User"
  }
}
```

### GET /api/health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "message": "Server is running"
}
```

## Default Credentials

- Email: `admin@dropsyncr.com`
- Password: `admin123`

## Notes

- The server uses in-memory user storage. Replace with a database in production.
- JWT tokens expire after 24 hours.
- CORS is configured to allow requests from `http://localhost:3000`.

