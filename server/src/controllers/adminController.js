import bcrypt from 'bcryptjs';
import prisma from '../config/database.js';

export const getUsers = async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      ...(search && {
        OR: [
          { email: { contains: search } },
          { name: { contains: search } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isGlobalAdmin: true,
          defaultInstallationId: true,
          createdAt: true,
          defaultInstallation: {
            select: {
              id: true,
              name: true,
            },
          },
          installations: {
            include: {
              installation: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users: users.map(user => ({
        ...user,
        installations: user.installations.map(ui => ui.installation),
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createUser = async (req, res) => {
  try {
    const { email, password, name, role, isGlobalAdmin, installationIds, defaultInstallationId } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const parsedInstallationIds = Array.from(new Set(
      (Array.isArray(installationIds) ? installationIds : [])
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isInteger(id) && id > 0)
    ));

    const parsedDefaultInstallationId = defaultInstallationId !== undefined && defaultInstallationId !== null && String(defaultInstallationId).trim() !== ''
      ? parseInt(defaultInstallationId, 10)
      : null;

    if (parsedDefaultInstallationId !== null && !Number.isInteger(parsedDefaultInstallationId)) {
      return res.status(400).json({ error: 'Invalid default installation ID' });
    }

    if (
      parsedDefaultInstallationId !== null
      && !parsedInstallationIds.includes(parsedDefaultInstallationId)
    ) {
      return res.status(400).json({ error: 'Default installation must be one of the assigned installations' });
    }

    const resolvedDefaultInstallationId = parsedDefaultInstallationId ?? (parsedInstallationIds[0] || null);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: role || 'user',
        isGlobalAdmin: isGlobalAdmin || false,
        defaultInstallationId: resolvedDefaultInstallationId,
        installations: parsedInstallationIds.length > 0 ? {
          create: parsedInstallationIds.map((id) => ({
            installationId: parseInt(id),
          })),
        } : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isGlobalAdmin: true,
        defaultInstallationId: true,
        createdAt: true,
        defaultInstallation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.status(201).json(user);
  } catch (error) {
    console.error('Create user error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, role, isGlobalAdmin, password, installationIds, defaultInstallationId } = req.body;
    const userId = parseInt(id, 10);

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        defaultInstallationId: true,
        installations: {
          select: { installationId: true },
        },
      },
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updateData = {};
    if (email !== undefined) updateData.email = email;
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (isGlobalAdmin !== undefined) updateData.isGlobalAdmin = isGlobalAdmin;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const parsedInstallationIds = installationIds !== undefined
      ? Array.from(new Set(
          (Array.isArray(installationIds) ? installationIds : [])
            .map((instId) => parseInt(instId, 10))
            .filter((instId) => Number.isInteger(instId) && instId > 0)
        ))
      : existingUser.installations.map((entry) => entry.installationId);

    const parsedDefaultInstallationId = defaultInstallationId !== undefined
      ? (
          defaultInstallationId === null || String(defaultInstallationId).trim() === ''
            ? null
            : parseInt(defaultInstallationId, 10)
        )
      : existingUser.defaultInstallationId;

    if (parsedDefaultInstallationId !== null && !Number.isInteger(parsedDefaultInstallationId)) {
      return res.status(400).json({ error: 'Invalid default installation ID' });
    }

    if (
      parsedDefaultInstallationId !== null
      && !parsedInstallationIds.includes(parsedDefaultInstallationId)
    ) {
      return res.status(400).json({ error: 'Default installation must be one of the assigned installations' });
    }

    const resolvedDefaultInstallationId = parsedDefaultInstallationId ?? (parsedInstallationIds[0] || null);
    updateData.defaultInstallationId = resolvedDefaultInstallationId;

    // Handle installation assignments
    if (installationIds !== undefined) {
      // Remove existing assignments
      await prisma.userInstallation.deleteMany({
        where: { userId },
      });

      // Create new assignments
      if (parsedInstallationIds.length > 0) {
        await prisma.userInstallation.createMany({
          data: parsedInstallationIds.map((instId) => ({
            userId,
            installationId: instId,
          })),
        });
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isGlobalAdmin: true,
        defaultInstallationId: true,
        createdAt: true,
        defaultInstallation: {
          select: {
            id: true,
            name: true,
          },
        },
        installations: {
          include: {
            installation: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    res.json({
      ...user,
      installations: user.installations.map(ui => ui.installation),
    });
  } catch (error) {
    console.error('Update user error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await prisma.user.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

