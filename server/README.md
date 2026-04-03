# Dropsyncr Server

Node.js Express server with authentication for the Dropsyncr application.

## Setup

1. Install dependencies:
```bash
cd server
npm install
```

2. Create a `.env` file:
```env
PORT=5000
JWT_SECRET=replace-with-a-random-string-at-least-32-characters
JWT_EXPIRES_IN=12h
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

## Security Notes

- Always use a strong `JWT_SECRET` (32+ chars).
- Login endpoint has built-in rate limiting to reduce brute-force attempts.
- JWT tokens are signed with issuer validation (`dropsyncr-server`).
- In production, detailed internal errors are not returned in API responses.

## Notes

- CORS is allowlisted for configured frontend origins.

## Maintenance Scripts

Run from the `server` folder.

- Preview Bol status repair (dry-run):
```bash
npm run backfill:bol-status
```

- Apply Bol status repair:
```bash
npm run backfill:bol-status:apply
```

- Optional: limit rows or scope to installation:
```bash
node backfill-bol-status.js --apply --limit=1000 --installationId=12
```

