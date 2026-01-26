import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      console.log('[Auth] No authorization header');
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.split(' ')[1] 
      : authHeader;

    if (!token) {
      console.log('[Auth] No token in authorization header');
      return res.status(401).json({ error: 'No token provided' });
    }

    const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
    
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
      console.log('[Auth] Token verified successfully, userId:', decoded.userId);
    } catch (jwtError) {
      console.error('[Auth] JWT verification failed:', jwtError.name, jwtError.message);
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
      console.error('[Auth] Token decoded but missing userId:', decoded);
      return res.status(401).json({ error: 'Invalid token format' });
    }

    let user;
    try {
      console.log('[Auth] Fetching user from database, userId:', decoded.userId);
      user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isGlobalAdmin: true,
        },
      });
      console.log('[Auth] User found:', user ? `id=${user.id}, email=${user.email}` : 'null');
    } catch (dbError) {
      console.error('[Auth] Database error when fetching user:');
      console.error('[Auth] Error name:', dbError.name);
      console.error('[Auth] Error message:', dbError.message);
      console.error('[Auth] Error code:', dbError.code);
      console.error('[Auth] Error stack:', dbError.stack);
      return res.status(500).json({ 
        error: 'Database error', 
        details: dbError.message,
        code: dbError.code 
      });
    }

    if (!user) {
      console.error('[Auth] User not found for userId:', decoded.userId);
      return res.status(401).json({ error: 'User not found' });
    }

    // Ensure isGlobalAdmin is a boolean (MySQL returns 1/0)
    req.user = {
      ...user,
      isGlobalAdmin: Boolean(user.isGlobalAdmin === true || user.isGlobalAdmin === 1),
    };
    next();
  } catch (error) {
    console.error('[Auth] Unexpected error:', error);
    console.error('[Auth] Error stack:', error.stack);
    console.error('[Auth] Error name:', error.name);
    console.error('[Auth] Error message:', error.message);
    
    // Return more detailed error information
    const errorResponse = {
      error: 'Authentication failed',
      details: error.message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack,
        name: error.name,
      }),
    };
    
    res.status(401).json(errorResponse);
  }
};

