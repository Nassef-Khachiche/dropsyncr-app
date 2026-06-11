import prisma from '../config/database.js';

export const getLocations = async (req, res) => {
  try {
    const { installationId } = req.query;

    const parsedInstallationId = parseInt(installationId, 10);
    if (Number.isNaN(parsedInstallationId)) {
      return res.status(400).json({ error: 'Invalid installation ID' });
    }

    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: { userId: req.user.id, installationId: parsedInstallationId },
      });
      if (!hasAccess) return res.status(403).json({ error: 'Access denied' });
    }

    const locations = await prisma.warehouseLocation.findMany({
      where: { installationId: parsedInstallationId },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });

    res.json({ locations });
  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createLocation = async (req, res) => {
  try {
    const { installationId, code, type, parentId } = req.body;

    const parsedInstallationId = parseInt(installationId, 10);
    if (Number.isNaN(parsedInstallationId)) {
      return res.status(400).json({ error: 'Invalid installation ID' });
    }

    // Only global admins can create locations
    if (!req.user.isGlobalAdmin) {
      return res.status(403).json({ error: 'Only administrators can create locations' });
    }

    if (!code || !type) {
      return res.status(400).json({ error: 'Code and type are required' });
    }

    if (!['row', 'section', 'case', 'pallet'].includes(type)) {
      return res.status(400).json({ error: 'Type must be row, section, case, or pallet' });
    }

    // Validate parent
    if (type === 'section' && !parentId) {
      return res.status(400).json({ error: 'Section requires a parent row' });
    }
    if (type === 'case' && !parentId) {
      return res.status(400).json({ error: 'Case requires a parent section' });
    }
    if (type === 'pallet' && !parentId) {
      return res.status(400).json({ error: 'Pallet requires a parent case' });
    }

    const location = await prisma.warehouseLocation.create({
      data: {
        installationId: parsedInstallationId,
        code: code.trim().toUpperCase(),
        type,
        parentId: parentId ? parseInt(parentId, 10) : null,
        active: true,
      },
    });

    res.status(201).json(location);
  } catch (error) {
    console.error('Create location error:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Location code already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, active, arrowDirection } = req.body;

    if (!req.user.isGlobalAdmin) {
      return res.status(403).json({ error: 'Only administrators can update locations' });
    }

    const parsedId = parseInt(id, 10);
    if (Number.isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid location ID' });
    }

    const updateData = {};
    if (code !== undefined) updateData.code = code.trim().toUpperCase();
    if (active !== undefined) updateData.active = active;
    if (arrowDirection !== undefined) {
      if (!['up', 'down', 'none'].includes(arrowDirection)) {
        return res.status(400).json({ error: 'arrowDirection must be up, down, or none' });
      }
      updateData.arrowDirection = arrowDirection;
    }

    const location = await prisma.warehouseLocation.update({
      where: { id: parsedId },
      data: updateData,
    });

    res.json(location);
  } catch (error) {
    console.error('Update location error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const bulkCreateLocations = async (req, res) => {
  try {
    const { installationId, rows } = req.body;
    // rows = [{ code, sections: [{ code, cases: [{ code, pallets: [{ code }] }] }] }]

    if (!req.user.isGlobalAdmin) {
      return res.status(403).json({ error: 'Only administrators can create locations' });
    }

    const parsedInstallationId = parseInt(installationId, 10);
    if (Number.isNaN(parsedInstallationId)) {
      return res.status(400).json({ error: 'Invalid installation ID' });
    }

    const created = [];

    for (const rowData of rows) {
      // Create row
      const row = await prisma.warehouseLocation.create({
        data: {
          installationId: parsedInstallationId,
          code: rowData.code.trim().toUpperCase(),
          type: 'row',
          parentId: null,
          active: true,
        },
      });
      created.push(row);

      for (const sectionData of (rowData.sections || [])) {
        // Create section
        const section = await prisma.warehouseLocation.create({
          data: {
            installationId: parsedInstallationId,
            code: sectionData.code.trim().toUpperCase(),
            type: 'section',
            parentId: row.id,
            active: true,
          },
        });
        created.push(section);

        for (const caseData of (sectionData.cases || [])) {
          // Create case
          const caseLocation = await prisma.warehouseLocation.create({
            data: {
              installationId: parsedInstallationId,
              code: caseData.code.trim().toUpperCase(),
              type: 'case',
              parentId: section.id,
              active: true,
            },
          });
          created.push(caseLocation);

          for (const palletData of (caseData.pallets || [])) {
            // Create pallet (palletplaats) — 4th level
            const palletLocation = await prisma.warehouseLocation.create({
              data: {
                installationId: parsedInstallationId,
                code: palletData.code.trim().toUpperCase(),
                type: 'pallet',
                parentId: caseLocation.id,
                active: true,
              },
            });
            created.push(palletLocation);
          }
        }
      }
    }

    res.status(201).json({ locations: created, count: created.length });
  } catch (error) {
    console.error('Bulk create locations error:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'One or more location codes already exist' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteLocation = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user.isGlobalAdmin) {
      return res.status(403).json({ error: 'Only administrators can delete locations' });
    }

    const parsedId = parseInt(id, 10);
    if (Number.isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid location ID' });
    }

    // Check if location has children
    const children = await prisma.warehouseLocation.findFirst({
      where: { parentId: parsedId },
    });

    if (children) {
      return res.status(400).json({ error: 'Cannot delete location with children. Delete children first.' });
    }

    await prisma.warehouseLocation.delete({ where: { id: parsedId } });

    res.json({ message: 'Location deleted successfully' });
  } catch (error) {
    console.error('Delete location error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};