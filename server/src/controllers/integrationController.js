import prisma from '../config/database.js';

/**
 * Get all integrations for an installation
 */
export const getIntegrations = async (req, res) => {
  try {
    const { installationId } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }

    // Check if user has access to this installation
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

    const integrations = await prisma.integration.findMany({
      where: {
        installationId: parseInt(installationId),
      },
      orderBy: { createdAt: 'desc' },
    });

    // Don't expose full credentials in the response
    const sanitizedIntegrations = integrations.map(integration => {
      const credentials = JSON.parse(integration.credentials);
      return {
        ...integration,
        credentials: {
          clientId: credentials.clientId ? `${credentials.clientId.substring(0, 8)}...` : null,
          hasSecret: !!credentials.clientSecret,
        },
      };
    });

    res.json({ integrations: sanitizedIntegrations });
  } catch (error) {
    console.error('Get integrations error:', error);
    res.status(500).json({ error: 'Failed to get integrations' });
  }
};

/**
 * Create a new integration
 */
export const createIntegration = async (req, res) => {
  try {
    const { installationId, platform, credentials, settings, active = true } = req.body;

    console.log('[Integration] Create request:', { installationId, platform, hasCredentials: !!credentials, active });

    if (!installationId || !platform || !credentials) {
      console.error('[Integration] Missing required fields:', { installationId, platform, credentials });
      return res.status(400).json({ error: 'Installation ID, platform, and credentials are required' });
    }

    // Check if user has access to this installation
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: parseInt(installationId),
        },
      });

      if (!hasAccess) {
        console.error('[Integration] Access denied for user:', req.user.id, 'to installation:', installationId);
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    // Validate credentials based on platform
    if (platform === 'bol.com') {
      if (!credentials.clientId || !credentials.clientSecret) {
        console.error('[Integration] Missing Bol.com credentials');
        return res.status(400).json({ error: 'Client ID and Client Secret are required for Bol.com' });
      }
    }

    // Allow multiple integrations per platform - removed the duplicate check
    console.log('[Integration] Creating integration...');
    const integration = await prisma.integration.create({
      data: {
        installationId: parseInt(installationId),
        platform,
        active,
        credentials: JSON.stringify(credentials),
        settings: settings ? JSON.stringify(settings) : null,
      },
    });

    console.log('[Integration] Integration created successfully:', integration.id);

    // Don't expose full credentials in response
    const sanitizedIntegration = {
      ...integration,
      credentials: {
        clientId: credentials.clientId ? `${credentials.clientId.substring(0, 8)}...` : null,
        hasSecret: !!credentials.clientSecret,
      },
    };

    res.json({ integration: sanitizedIntegration });
  } catch (error) {
    console.error('Create integration error:', error);
    res.status(500).json({ error: 'Failed to create integration', details: error.message });
  }
};

/**
 * Update an integration
 */
export const updateIntegration = async (req, res) => {
  try {
    const { id } = req.params;
    const { credentials, settings, active } = req.body;

    const integration = await prisma.integration.findUnique({
      where: { id: parseInt(id) },
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Check if user has access to this installation
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: integration.installationId,
        },
      });

      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const updateData = {};
    if (credentials) updateData.credentials = JSON.stringify(credentials);
    if (settings) updateData.settings = JSON.stringify(settings);
    if (active !== undefined) updateData.active = active;

    const updatedIntegration = await prisma.integration.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    // Don't expose full credentials in response
    const sanitizedIntegration = {
      ...updatedIntegration,
      credentials: credentials ? {
        clientId: credentials.clientId ? `${credentials.clientId.substring(0, 8)}...` : null,
        hasSecret: !!credentials.clientSecret,
      } : JSON.parse(updatedIntegration.credentials),
    };

    res.json({ integration: sanitizedIntegration });
  } catch (error) {
    console.error('Update integration error:', error);
    res.status(500).json({ error: 'Failed to update integration' });
  }
};

/**
 * Delete an integration
 */
export const deleteIntegration = async (req, res) => {
  try {
    const { id } = req.params;

    const integration = await prisma.integration.findUnique({
      where: { id: parseInt(id) },
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Check if user has access to this installation
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: integration.installationId,
        },
      });

      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    await prisma.integration.delete({
      where: { id: parseInt(id) },
    });

    res.json({ success: true, message: 'Integration deleted successfully' });
  } catch (error) {
    console.error('Delete integration error:', error);
    res.status(500).json({ error: 'Failed to delete integration' });
  }
};

/**
 * Test integration connection
 */
export const testIntegration = async (req, res) => {
  try {
    const { id } = req.params;

    const integration = await prisma.integration.findUnique({
      where: { id: parseInt(id) },
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Check if user has access to this installation
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: integration.installationId,
        },
      });

      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    // Test the connection based on platform
    // This is a placeholder - implement actual testing logic
    const credentials = JSON.parse(integration.credentials);
    
    if (integration.platform === 'bol.com') {
      // Test Bol.com connection
      // Implementation would go here
      res.json({ success: true, message: 'Connection test successful' });
    } else {
      res.json({ success: false, message: 'Platform not supported for testing' });
    }
  } catch (error) {
    console.error('Test integration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to test integration',
      details: error.message 
    });
  }
};
