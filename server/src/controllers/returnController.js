import prisma from '../config/database.js';

export const getReturns = async (req, res) => {
  try {
    const { installationId, status, search } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'installationId is required' });
    }

    const parsedInstallationId = parseInt(installationId, 10);
    if (Number.isNaN(parsedInstallationId)) {
      return res.status(400).json({ error: 'Invalid installation ID' });
    }

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: { userId: req.user.id, installationId: parsedInstallationId },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const andConditions = [];

    if (status && status !== 'all') {
      if (status === 'open') {
        andConditions.push({ status: { not: 'processed' } });
      } else if (status === 'processed') {
        andConditions.push({ status: 'processed' });
      } else {
        andConditions.push({ status });
      }
    }

    if (search) {
      andConditions.push({
        OR: [
          { returnNumber: { contains: search } },
          { orderNumber: { contains: search } },
          { customerName: { contains: search } },
          { rmaId: { contains: search } },
          { ffmClientName: { contains: search } },
        ],
      });
    }

    const returns = await prisma.return.findMany({
      where: {
        installationId: parsedInstallationId,
        ...(andConditions.length > 0 ? { AND: andConditions } : {}),
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ returns });
  } catch (error) {
    console.error('Get returns error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id, 10);

    if (Number.isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid return ID' });
    }

    const returnRecord = await prisma.return.findUnique({
      where: { id: parsedId },
      include: { items: true },
    });

    if (!returnRecord) {
      return res.status(404).json({ error: 'Return not found' });
    }

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: { userId: req.user.id, installationId: returnRecord.installationId },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json(returnRecord);
  } catch (error) {
    console.error('Get return error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createReturn = async (req, res) => {
  try {
    const {
      installationId,
      orderNumber,
      customerName,
      customerEmail,
      storeName,
      ffmClientName,
      platform,
      type,
      carrier,
      trackingCode,
      returnReason,
      returnReasonNote,
      address,
      street,
      postalCode,
      city,
      country,
      items,
    } = req.body;

    const parsedInstallationId = parseInt(installationId, 10);
    if (Number.isNaN(parsedInstallationId)) {
      return res.status(400).json({ error: 'Invalid installation ID' });
    }

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: { userId: req.user.id, installationId: parsedInstallationId },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    // Generate unique return number
    const returnNumber = 'MAN-' + Date.now().toString().slice(-6);

    const labelUrl = req.body.labelUrl || null;

    const newReturn = await prisma.return.create({
      data: {
        installationId: parsedInstallationId,
        returnNumber,
        orderNumber: orderNumber || '',
        customerName: customerName || '',
        customerEmail: customerEmail || null,
        storeName: storeName || ffmClientName || '',
        ffmClientName: ffmClientName || '',
        platform: platform || 'manual',
        type: type || 'own_stock',
        status: 'registered',
        carrier: carrier || null,
        trackingCode: trackingCode || null,
        returnReason: returnReason || null,
        returnReasonNote: returnReasonNote || null,
        address: address || null,
        items: {
          create: (items || []).map((item) => ({
            productName: item.productName || item.naam || '',
            ean: item.ean || null,
            rmaId: item.rmaId || item.rmaid || null,
            quantity: item.quantity || item.aantal || 1,
            price: parseFloat(item.price || item.bedrag || 0),
            imageUrl: item.imageUrl || item.afbeeldingUrl || null,
          })),
        },
      },
      include: { items: true },
    });

    // Save labelUrl via raw SQL to bypass Prisma column length validation
    if (labelUrl) {
      try {
        await prisma.$executeRaw`UPDATE \`Return\` SET qrCodeUrl = ${labelUrl}, updatedAt = NOW() WHERE id = ${newReturn.id}`;
        newReturn.qrCodeUrl = labelUrl;
      } catch (err) {
        console.error('Failed to save labelUrl on return:', err);
      }
    }

    res.status(201).json(newReturn);
  } catch (error) {
    console.error('Create return error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id, 10);

    if (Number.isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid return ID' });
    }

    const existingReturn = await prisma.return.findUnique({
      where: { id: parsedId },
    });

    if (!existingReturn) {
      return res.status(404).json({ error: 'Return not found' });
    }

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: { userId: req.user.id, installationId: existingReturn.installationId },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const {
      status,
      inspectionStatus,
      inspectionCount,
      processedAt,
      returnBoxStatus,
      qrCodeUrl,
      carrier,
      trackingCode,
      returnReason,
      returnReasonNote,
    } = req.body;

    const updateData = {};
    if (status !== undefined) updateData.status = status;
    if (inspectionStatus !== undefined) updateData.inspectionStatus = inspectionStatus;
    if (inspectionCount !== undefined) updateData.inspectionCount = parseInt(inspectionCount, 10);
    if (processedAt !== undefined) updateData.processedAt = processedAt ? new Date(processedAt) : null;
    if (returnBoxStatus !== undefined) updateData.returnBoxStatus = returnBoxStatus;
    // Use raw SQL for qrCodeUrl to bypass Prisma's column length validation
    if (qrCodeUrl !== undefined) {
      await prisma.$executeRaw`UPDATE \`Return\` SET qrCodeUrl = ${qrCodeUrl}, updatedAt = NOW() WHERE id = ${parsedId}`;
    }
    if (carrier !== undefined) updateData.carrier = carrier;
    if (trackingCode !== undefined) updateData.trackingCode = trackingCode;
    if (returnReason !== undefined) updateData.returnReason = returnReason;
    if (returnReasonNote !== undefined) updateData.returnReasonNote = returnReasonNote;

    const updatedReturn = await prisma.return.update({
      where: { id: parsedId },
      data: updateData,
      include: { items: true },
    });

    res.json(updatedReturn);
  } catch (error) {
    console.error('Update return error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Return not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id, 10);

    if (Number.isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid return ID' });
    }

    const existingReturn = await prisma.return.findUnique({
      where: { id: parsedId },
    });

    if (!existingReturn) {
      return res.status(404).json({ error: 'Return not found' });
    }

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: { userId: req.user.id, installationId: existingReturn.installationId },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    await prisma.return.delete({ where: { id: parsedId } });

    res.json({ message: 'Return deleted successfully' });
  } catch (error) {
    console.error('Delete return error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Return not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};