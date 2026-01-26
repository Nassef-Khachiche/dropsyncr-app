import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';

export const requireGlobalAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header provided' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
    const decoded = jwt.verify(token, jwtSecret);
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
      return res.status(403).json({ 
        error: 'Access denied. Global admin required.',
        userIsGlobalAdmin: user.isGlobalAdmin,
        userEmail: user.email
      });
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
    res.status(401).json({ error: 'Authentication failed', details: error.message });
  }
};

