import prisma from '../config/database.js';

export const getCarriers = async (req, res) => {
  try {
    const { installationId } = req.query;

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: parseInt(installationId),
        },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const carriers = await prisma.carrier.findMany({
      where: {
        installationId: parseInt(installationId),
      },
      orderBy: { createdAt: 'desc' },
    });

    // Parse credentials JSON
    const carriersWithParsedCredentials = carriers.map((carrier) => ({
      ...carrier,
      credentials: JSON.parse(carrier.credentials || '{}'),
    }));

    res.json(carriersWithParsedCredentials);
  } catch (error) {
    console.error('Get carriers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createCarrier = async (req, res) => {
  try {
    const { installationId, carrierType, contractName, active, credentials } = req.body;

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: parseInt(installationId),
        },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const carrier = await prisma.carrier.create({
      data: {
        installationId: parseInt(installationId),
        carrierType,
        contractName,
        active: active !== undefined ? active : true,
        credentials: JSON.stringify(credentials || {}),
      },
    });

    res.status(201).json({
      ...carrier,
      credentials: JSON.parse(carrier.credentials),
    });
  } catch (error) {
    console.error('Create carrier error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateCarrier = async (req, res) => {
  try {
    const { id } = req.params;
    const { contractName, active, credentials } = req.body;

    const updateData = {};
    if (contractName !== undefined) updateData.contractName = contractName;
    if (active !== undefined) updateData.active = active;
    if (credentials !== undefined) updateData.credentials = JSON.stringify(credentials);

    const carrier = await prisma.carrier.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    res.json({
      ...carrier,
      credentials: JSON.parse(carrier.credentials),
    });
  } catch (error) {
    console.error('Update carrier error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Carrier not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteCarrier = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.carrier.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'Carrier deleted successfully' });
  } catch (error) {
    console.error('Delete carrier error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Carrier not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const testCarrierConnection = async (req, res) => {
  try {
    const { id } = req.params;

    const carrier = await prisma.carrier.findUnique({
      where: { id: parseInt(id) },
    });

    if (!carrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: carrier.installationId,
        },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const credentials = JSON.parse(carrier.credentials || '{}');

    if (carrier.carrierType === 'dhl') {
      const hasRequired = !!credentials.userId && !!credentials.accountNumber && !!credentials.apiKey;
      return res.json({
        success: hasRequired,
        message: hasRequired ? 'DHL verbinding succesvol getest' : 'DHL credentials zijn incompleet',
      });
    }

    if (carrier.carrierType === 'dpd') {
      const hasRequired = !!credentials.username && !!credentials.password;
      return res.json({
        success: hasRequired,
        message: hasRequired ? 'DPD verbinding succesvol getest' : 'DPD credentials zijn incompleet',
      });
    }

    return res.json({
      success: false,
      message: 'Carrier type wordt momenteel niet ondersteund',
    });
  } catch (error) {
    console.error('Test carrier error:', error);
    res.status(500).json({ success: false, error: 'Failed to test carrier' });
  }
};

export const generateCarrierLabels = async (req, res) => {
  try {
    const { id } = req.params;
    const { packages = [], shippingMethod } = req.body;

    const carrier = await prisma.carrier.findUnique({
      where: { id: parseInt(id) },
    });

    if (!carrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    if (!carrier.active) {
      return res.status(400).json({ error: 'Carrier contract is inactive' });
    }

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: carrier.installationId,
        },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    if (!['dhl', 'dpd'].includes(carrier.carrierType)) {
      return res.status(400).json({ error: 'Carrier type not supported for labels' });
    }

    const labels = (packages || []).map((pkg, index) => {
      const timestamp = Date.now();
      return {
        packageId: pkg.id || index,
        carrierType: carrier.carrierType,
        shippingMethod: shippingMethod || null,
        trackingCode: `${carrier.carrierType.toUpperCase()}-${timestamp}-${index}`,
        labelUrl: `https://labels.dropsyncr.local/${carrier.carrierType}/${timestamp}-${index}.pdf`,
      };
    });

    res.json({ success: true, labels });
  } catch (error) {
    console.error('Generate carrier labels error:', error);
    res.status(500).json({ error: 'Failed to generate labels' });
  }
};

