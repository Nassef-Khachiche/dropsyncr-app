import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';
import { extractBearerToken, getJwtSecret } from '../utils/security.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const jwtSecret = getJwtSecret();
    
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret, { issuer: 'dropsyncr-server' });
    } catch (jwtError) {
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid token' });
      }
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired. Please log in again.' });
      }
      throw jwtError;
    }

    // Validate decoded token has userId
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: 'Invalid token format' });
    }

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
    req.user = {
      ...user,
      isGlobalAdmin: Boolean(user.isGlobalAdmin === true || user.isGlobalAdmin === 1),
    };
    next();
  } catch (error) {
    console.error('[Auth] Authentication middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

