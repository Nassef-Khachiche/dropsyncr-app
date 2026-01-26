import prisma from '../config/database.js';

export const getInstallations = async (req, res) => {
  try {
    const { search, type, active, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      ...(search && {
        OR: [
          { name: { contains: search } },
        ],
      }),
      ...(type && type !== 'all' && { type }),
      ...(active !== undefined && { active: active === 'true' }),
    };

    const [installations, total] = await Promise.all([
      prisma.installation.findMany({
        where,
        include: {
          users: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              orders: true,
              products: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.installation.count({ where }),
    ]);

    res.json({
      installations: installations.map(inst => ({
        ...inst,
        users: inst.users.map(ui => ui.user),
        orderCount: inst._count.orders,
        productCount: inst._count.products,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get installations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getInstallation = async (req, res) => {
  try {
    const { id } = req.params;

    const installation = await prisma.installation.findUnique({
      where: { id: parseInt(id) },
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!installation) {
      return res.status(404).json({ error: 'Installation not found' });
    }

    res.json({
      ...installation,
      users: installation.users.map(ui => ui.user),
    });
  } catch (error) {
    console.error('Get installation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createInstallation = async (req, res) => {
  try {
    const { name, type, country, contract, active, userIds } = req.body;

    if (!name || !type || !country) {
      return res.status(400).json({ error: 'Name, type, and country are required' });
    }

    const installation = await prisma.installation.create({
      data: {
        name,
        type,
        country,
        contract,
        active: active !== undefined ? active : true,
        users: userIds && userIds.length > 0 ? {
          create: userIds.map((userId) => ({
            userId: parseInt(userId),
          })),
        } : undefined,
      },
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json({
      ...installation,
      users: installation.users.map(ui => ui.user),
    });
  } catch (error) {
    console.error('Create installation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateInstallation = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, country, contract, active, userIds } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (country !== undefined) updateData.country = country;
    if (contract !== undefined) updateData.contract = contract;
    if (active !== undefined) updateData.active = active;

    // Handle user assignments
    if (userIds !== undefined) {
      // Remove existing assignments
      await prisma.userInstallation.deleteMany({
        where: { installationId: parseInt(id) },
      });

      // Create new assignments
      if (userIds.length > 0) {
        await prisma.userInstallation.createMany({
          data: userIds.map((userId) => ({
            userId: parseInt(userId),
            installationId: parseInt(id),
          })),
        });
      }
    }

    const installation = await prisma.installation.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    res.json({
      ...installation,
      users: installation.users.map(ui => ui.user),
    });
  } catch (error) {
    console.error('Update installation error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Installation not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteInstallation = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.installation.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'Installation deleted successfully' });
  } catch (error) {
    console.error('Delete installation error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Installation not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

