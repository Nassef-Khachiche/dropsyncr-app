import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';
import { extractBearerToken, getJwtSecret } from '../utils/security.js';

export const requireGlobalAdmin = async (req, res, next) => {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const jwtSecret = getJwtSecret();
    const decoded = jwt.verify(token, jwtSecret, { issuer: 'dropsyncr-server' });
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isGlobalAdmin: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Ensure isGlobalAdmin is a boolean (MySQL returns 1/0)
    const isGlobalAdmin = Boolean(user.isGlobalAdmin === true || user.isGlobalAdmin === 1);
    
    if (!isGlobalAdmin) {
      return res.status(403).json({ error: 'Access denied. Global admin required.' });
    }

    req.user = {
      ...user,
      isGlobalAdmin: true, // Set to true since we've verified it
    };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Admin auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

