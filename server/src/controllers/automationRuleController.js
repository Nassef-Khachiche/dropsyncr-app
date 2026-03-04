import prisma from '../config/database.js';

const normalizeCountryCode = (value = '') => String(value).trim().toUpperCase();

const ensureInstallationAccess = async (user, installationId) => {
  if (user.isGlobalAdmin) return true;

  const hasAccess = await prisma.userInstallation.findFirst({
    where: {
      userId: user.id,
      installationId,
    },
  });

  return !!hasAccess;
};

export const getAutomationRules = async (req, res) => {
  try {
    const { installationId, userScoped } = req.query;
    const forceUserScope = userScoped === 'true';
    const isAllStoresMode = !installationId || installationId === 'all';

    let where = {};

    if (isAllStoresMode) {
      if (req.user.isGlobalAdmin && !forceUserScope) {
        where = {};
      } else {
        const userInstallations = await prisma.userInstallation.findMany({
          where: { userId: req.user.id },
          select: { installationId: true },
        });

        const installationIds = userInstallations.map((ui) => ui.installationId);
        where = {
          installationId: {
            in: installationIds,
          },
        };
      }
    } else {
      const parsedInstallationId = parseInt(installationId, 10);
      if (Number.isNaN(parsedInstallationId)) {
        return res.status(400).json({ error: 'Invalid installation ID' });
      }

      const hasAccess = await ensureInstallationAccess(req.user, parsedInstallationId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }

      where = { installationId: parsedInstallationId };
    }

    const rules = await prisma.automationRule.findMany({
      where,
      include: {
        installation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { priority: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    res.json({ rules });
  } catch (error) {
    console.error('Get automation rules error:', error);
    res.status(500).json({
      error: 'Failed to get automation rules',
      details: error?.message || 'Unknown server error',
    });
  }
};

export const createAutomationRule = async (req, res) => {
  try {
    const { installationId, name, countryCode, carrierType, priority = 100, active = true } = req.body;

    if (!installationId || !name || !countryCode || !carrierType) {
      return res.status(400).json({
        error: 'installationId, name, countryCode, and carrierType are required',
      });
    }

    const parsedInstallationId = parseInt(installationId, 10);
    const parsedPriority = parseInt(priority, 10);

    if (Number.isNaN(parsedInstallationId)) {
      return res.status(400).json({ error: 'Invalid installation ID' });
    }

    if (Number.isNaN(parsedPriority)) {
      return res.status(400).json({ error: 'Invalid priority' });
    }

    const installation = await prisma.installation.findUnique({
      where: { id: parsedInstallationId },
      select: { id: true },
    });

    if (!installation) {
      return res.status(400).json({ error: 'Invalid installation ID' });
    }

    const hasAccess = await ensureInstallationAccess(req.user, parsedInstallationId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const rule = await prisma.automationRule.create({
      data: {
        installationId: parsedInstallationId,
        name: String(name).trim(),
        countryCode: normalizeCountryCode(countryCode),
        carrierType: String(carrierType).trim().toLowerCase(),
        priority: parsedPriority,
        active: Boolean(active),
      },
      include: {
        installation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.status(201).json({ rule });
  } catch (error) {
    console.error('Create automation rule error:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'A rule with this country and priority already exists for this installation' });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Invalid relation data for automation rule' });
    }
    if (error.code === 'P2000') {
      return res.status(400).json({ error: 'One or more fields are too long' });
    }
    res.status(500).json({
      error: 'Failed to create automation rule',
      details: error?.message || 'Unknown server error',
    });
  }
};

export const updateAutomationRule = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, countryCode, carrierType, priority, active } = req.body;

    const parsedId = parseInt(id, 10);
    if (Number.isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid rule ID' });
    }

    const existingRule = await prisma.automationRule.findUnique({
      where: { id: parsedId },
    });

    if (!existingRule) {
      return res.status(404).json({ error: 'Automation rule not found' });
    }

    const hasAccess = await ensureInstallationAccess(req.user, existingRule.installationId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (countryCode !== undefined) updateData.countryCode = normalizeCountryCode(countryCode);
    if (carrierType !== undefined) updateData.carrierType = String(carrierType).trim().toLowerCase();
    if (priority !== undefined) {
      const parsedPriority = parseInt(priority, 10);
      if (Number.isNaN(parsedPriority)) {
        return res.status(400).json({ error: 'Invalid priority' });
      }
      updateData.priority = parsedPriority;
    }
    if (active !== undefined) updateData.active = Boolean(active);

    const rule = await prisma.automationRule.update({
      where: { id: parsedId },
      data: updateData,
      include: {
        installation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.json({ rule });
  } catch (error) {
    console.error('Update automation rule error:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'A rule with this country and priority already exists for this installation' });
    }
    if (error.code === 'P2000') {
      return res.status(400).json({ error: 'One or more fields are too long' });
    }
    res.status(500).json({
      error: 'Failed to update automation rule',
      details: error?.message || 'Unknown server error',
    });
  }
};

export const deleteAutomationRule = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id, 10);

    if (Number.isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid rule ID' });
    }

    const existingRule = await prisma.automationRule.findUnique({
      where: { id: parsedId },
    });

    if (!existingRule) {
      return res.status(404).json({ error: 'Automation rule not found' });
    }

    const hasAccess = await ensureInstallationAccess(req.user, existingRule.installationId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    await prisma.automationRule.delete({
      where: { id: parsedId },
    });

    res.json({ success: true, message: 'Automation rule deleted successfully' });
  } catch (error) {
    console.error('Delete automation rule error:', error);
    res.status(500).json({
      error: 'Failed to delete automation rule',
      details: error?.message || 'Unknown server error',
    });
  }
};
