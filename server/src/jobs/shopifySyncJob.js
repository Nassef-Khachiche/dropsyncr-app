import prisma from '../config/database.js';
import { syncShopifyOrdersForInstallation } from '../controllers/shopifyController.js';

// Shopify sync job: runs every N minutes (SHOPIFY_SYNC_INTERVAL_MINUTES, default 5)
// for all active Shopify integrations. Skips cycle if previous one is still running.

let shopifySyncIntervalRef = null;
let isShopifySyncRunning = false;

async function runShopifySyncCycle() {
  if (isShopifySyncRunning) {
    console.log('[SHOPIFY CRON] Previous sync cycle still running; skipping this run');
    return;
  }

  isShopifySyncRunning = true;

  try {
    const activeIntegrations = await prisma.integration.findMany({
      where: { platform: 'shopify', active: true },
      select: { id: true, installationId: true },
    });

    if (activeIntegrations.length === 0) {
      console.log('[SHOPIFY CRON] No active Shopify integrations found');
      return;
    }

    console.log(`[SHOPIFY CRON] Starting sync cycle for ${activeIntegrations.length} integration(s)`);

    for (const integration of activeIntegrations) {
      try {
        const result = await syncShopifyOrdersForInstallation({
          installationId: integration.installationId,
          integrationId: integration.id,
        });

        console.log('[SHOPIFY CRON] Sync completed', {
          integrationId: integration.id,
          installationId: integration.installationId,
          imported: result.imported,
          updated: result.updated,
          total: result.total,
        });
      } catch (installationError) {
        console.error('[SHOPIFY CRON] Sync failed for installation', {
          integrationId: integration.id,
          installationId: integration.installationId,
          error: installationError.message,
        });
      }
    }
  } catch (error) {
    console.error('[SHOPIFY CRON] Failed to execute sync cycle:', error);
  } finally {
    isShopifySyncRunning = false;
  }
}

export function startShopifySyncCronJob() {
  const syncIntervalMinutes = parseInt(process.env.SHOPIFY_SYNC_INTERVAL_MINUTES || '5', 10);
  const safeIntervalMinutes =
    Number.isFinite(syncIntervalMinutes) && syncIntervalMinutes > 0 ? syncIntervalMinutes : 5;

  const intervalMs = safeIntervalMinutes * 60 * 1000;

  if (shopifySyncIntervalRef) {
    clearInterval(shopifySyncIntervalRef);
  }

  shopifySyncIntervalRef = setInterval(() => {
    runShopifySyncCycle();
  }, intervalMs);

  // Run once immediately on startup
  runShopifySyncCycle();

  console.log(`[SHOPIFY CRON] Sync job started — interval: ${safeIntervalMinutes} min`);
}

export function stopShopifySyncCronJob() {
  if (shopifySyncIntervalRef) {
    clearInterval(shopifySyncIntervalRef);
    shopifySyncIntervalRef = null;
    console.log('[SHOPIFY CRON] Sync job stopped');
  }
}
