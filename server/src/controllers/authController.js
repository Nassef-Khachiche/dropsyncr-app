import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';
import { getJwtSecret } from '../utils/security.js';

export const login = async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (email.length > 254 || password.length > 256) {
      return res.status(400).json({ error: 'Invalid credentials format' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const jwtSecret = getJwtSecret();
    const tokenExpiry = process.env.JWT_EXPIRES_IN || '12h';
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      jwtSecret,
      {
        expiresIn: tokenExpiry,
        issuer: 'dropsyncr-server',
      }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isGlobalAdmin: user.isGlobalAdmin,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const verify = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
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

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getInstallations = async (req, res) => {
  try {
    // Global admins can see all installations
    // Regular users only see their assigned installations
    const where = req.user.isGlobalAdmin
      ? {}
      : {
          users: {
            some: {
              userId: req.user.id,
            },
          },
        };

    const installations = await prisma.installation.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    res.json(installations);
  } catch (error) {
    console.error('Get installations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

