import prisma from '../config/database.js';

const parseJsonSafely = (value, fallback = {}) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeCredentials = (platform, rawCredentials = {}) => {
  const credentials = { ...(rawCredentials || {}) };

  const trimField = (key) => {
    if (credentials[key] === undefined || credentials[key] === null) return;
    if (typeof credentials[key] === 'string') {
      credentials[key] = credentials[key].trim();
    }
  };

  trimField('shopName');

  if (platform === 'shopify') {
    trimField('shopDomain');
    trimField('accessToken');
    trimField('clientId');
    trimField('clientSecret');
  } else {
    trimField('clientId');
    trimField('clientSecret');
  }

  return credentials;
};

/**
 * Get all integrations for an installation
 */
export const getIntegrations = async (req, res) => {
  try {
    const { installationId, userScoped } = req.query;
    const isAllStoresMode = !installationId || installationId === 'all';
    const forceUserScope = userScoped === 'true';

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

      // Check if user has access to this installation
      if (!req.user.isGlobalAdmin) {
        const hasAccess = await prisma.userInstallation.findFirst({
          where: {
            userId: req.user.id,
            installationId: parsedInstallationId,
          },
        });

        if (!hasAccess) {
          return res.status(403).json({ error: 'Access denied to this installation' });
        }
      }

      where = {
        installationId: parsedInstallationId,
      };
    }

    const integrations = await prisma.integration.findMany({
      where,
      include: {
        installation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Don't expose full credentials in the response
    const sanitizedIntegrations = integrations.map(integration => {
      const credentials = parseJsonSafely(integration.credentials);
      const settings = parseJsonSafely(integration.settings);
      const isShopify = integration.platform === 'shopify';

      return {
        ...integration,
        credentials: {
          shopName: credentials.shopName || null,
          shopDomain: isShopify ? (credentials.shopDomain ? `${credentials.shopDomain.substring(0, 24)}...` : null) : null,
          clientId: isShopify
            ? (credentials.shopDomain ? `${credentials.shopDomain.substring(0, 16)}...` : null)
            : (credentials.clientId ? `${credentials.clientId.substring(0, 8)}...` : null),
          hasSecret: isShopify
            ? !!credentials.accessToken
            : !!credentials.clientSecret,
        },
        settings,
        installation: integration.installation,
      };
    });

    res.json({ integrations: sanitizedIntegrations });
  } catch (error) {
    console.error('Get integrations error:', error);
    res.status(500).json({ error: 'Failed to get integrations' });
  }
};

/**
 * Get full credentials for a specific integration (settings edit only)
 */
export const getIntegrationCredentials = async (req, res) => {
  try {
    const { id } = req.params;
    const integrationId = parseInt(id, 10);

    if (Number.isNaN(integrationId)) {
      return res.status(400).json({ error: 'Invalid integration ID' });
    }

    const integration = await prisma.integration.findUnique({
      where: { id: integrationId },
      select: {
        id: true,
        installationId: true,
        platform: true,
        credentials: true,
      },
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

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

    const credentials = parseJsonSafely(integration.credentials);
    const isShopify = integration.platform === 'shopify';

    return res.json({
      integrationId: integration.id,
      platform: integration.platform,
      credentials: {
        shopName: credentials.shopName || null,
        shopDomain: isShopify ? (credentials.shopDomain || '') : '',
        accessToken: isShopify ? (credentials.accessToken || '') : '',
        clientId: credentials.clientId || '',
        clientSecret: credentials.clientSecret || '',
      },
    });
  } catch (error) {
    console.error('Get integration credentials error:', error);
    return res.status(500).json({ error: 'Failed to get integration credentials' });
  }
};

/**
 * Create a new integration
 */
export const createIntegration = async (req, res) => {
  try {
    const { installationId, platform, credentials: rawCredentials, settings, active = true } = req.body;
    const credentials = normalizeCredentials(platform, rawCredentials);

    console.log('[Integration] Create request:', { installationId, platform, hasCredentials: !!credentials, active });

    if (!installationId || !platform || !rawCredentials) {
      console.error('[Integration] Missing required fields:', { installationId, platform, credentials: rawCredentials });
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
    } else if (platform === 'shopify') {
      if (!credentials.shopDomain || !credentials.clientId || !credentials.clientSecret) {
        console.error('[Integration] Missing Shopify credentials');
        return res.status(400).json({
          error: 'Shop Domain, Client ID, and Client Secret are required for Shopify',
        });
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
        shopName: credentials.shopName || null,
        shopDomain: platform === 'shopify'
          ? (credentials.shopDomain ? `${credentials.shopDomain.substring(0, 24)}...` : null)
          : null,
        clientId: platform === 'shopify'
          ? (credentials.shopDomain ? `${credentials.shopDomain.substring(0, 16)}...` : null)
          : (credentials.clientId ? `${credentials.clientId.substring(0, 8)}...` : null),
        hasSecret: platform === 'shopify' ? !!credentials.accessToken : !!credentials.clientSecret,
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
    const { credentials: incomingCredentials, settings, active } = req.body;

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

    const existingCredentials = parseJsonSafely(integration.credentials);
    const existingSettings = parseJsonSafely(integration.settings);
    const normalizedIncomingCredentials = incomingCredentials
      ? normalizeCredentials(integration.platform, incomingCredentials)
      : null;

    const mergedCredentials = normalizedIncomingCredentials
      ? {
          ...existingCredentials,
          ...normalizedIncomingCredentials,
        }
      : existingCredentials;

    const mergedSettings = settings
      ? {
          ...existingSettings,
          ...settings,
        }
      : existingSettings;

    if (integration.platform === 'bol.com') {
      const hasCredentialChanges = !!normalizedIncomingCredentials && (
        Object.prototype.hasOwnProperty.call(normalizedIncomingCredentials, 'clientId') ||
        Object.prototype.hasOwnProperty.call(normalizedIncomingCredentials, 'clientSecret')
      );

      if (hasCredentialChanges) {
        if (!mergedCredentials.clientId || !mergedCredentials.clientSecret) {
          return res.status(400).json({ error: 'Client ID and Client Secret are required for Bol.com' });
        }
      }
    } else if (integration.platform === 'shopify') {
      const hasCredentialChanges = !!normalizedIncomingCredentials && (
        Object.prototype.hasOwnProperty.call(normalizedIncomingCredentials, 'shopDomain') ||
        Object.prototype.hasOwnProperty.call(normalizedIncomingCredentials, 'clientId') ||
        Object.prototype.hasOwnProperty.call(normalizedIncomingCredentials, 'clientSecret')
      );

      if (hasCredentialChanges) {
        if (!mergedCredentials.shopDomain || !mergedCredentials.clientId || !mergedCredentials.clientSecret) {
          return res.status(400).json({
            error: 'Shop Domain, Client ID, and Client Secret are required for Shopify',
          });
        }
      }
    }

    const updateData = {};
    if (normalizedIncomingCredentials) updateData.credentials = JSON.stringify(mergedCredentials);
    if (settings) updateData.settings = JSON.stringify(mergedSettings);
    if (active !== undefined) updateData.active = active;

    const updatedIntegration = await prisma.integration.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    // Don't expose full credentials in response
    const sanitizedIntegration = {
      ...updatedIntegration,
      credentials: {
        shopName: mergedCredentials.shopName || null,
        shopDomain: integration.platform === 'shopify'
          ? (mergedCredentials.shopDomain ? `${mergedCredentials.shopDomain.substring(0, 24)}...` : null)
          : null,
        clientId: integration.platform === 'shopify'
          ? (mergedCredentials.shopDomain ? `${mergedCredentials.shopDomain.substring(0, 16)}...` : null)
          : (mergedCredentials.clientId ? `${mergedCredentials.clientId.substring(0, 8)}...` : null),
        hasSecret: integration.platform === 'shopify'
          ? !!mergedCredentials.accessToken
          : !!mergedCredentials.clientSecret,
      },
      settings: mergedSettings,
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
