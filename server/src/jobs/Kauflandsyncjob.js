import prisma from '../config/database.js';
import { syncKauflandOrdersForInstallation } from '../controllers/kauflandController.js';

let kauflandSyncIntervalRef = null;
let isKauflandSyncRunning = false;

async function runKauflandSyncCycle() {
  if (isKauflandSyncRunning) {
    console.log('[KAUFLAND CRON] Previous sync cycle still running; skipping this run');
    return;
  }

  isKauflandSyncRunning = true;

  try {
    const activeIntegrations = await prisma.integration.findMany({
      where: {
        platform: 'kaufland',
        active: true,
      },
      select: {
        id: true,
        installationId: true,
      },
    });

    if (activeIntegrations.length === 0) {
      console.log('[KAUFLAND CRON] No active Kaufland integrations found');
      return;
    }

    console.log(`[KAUFLAND CRON] Starting sync cycle for ${activeIntegrations.length} integration(s)`);

    for (const integration of activeIntegrations) {
      try {
        const result = await syncKauflandOrdersForInstallation({
          installationId: integration.installationId,
          integrationId: integration.id,
        });

        console.log('[KAUFLAND CRON] Sync completed', {
          integrationId: integration.id,
          installationId: integration.installationId,
          imported: result.imported,
          updated: result.updated,
          total: result.total,
        });
      } catch (installationError) {
        console.error('[KAUFLAND CRON] Sync failed for installation', {
          integrationId: integration.id,
          installationId: integration.installationId,
          error: installationError.message,
        });
      }
    }
  } catch (error) {
    console.error('[KAUFLAND CRON] Failed to execute sync cycle:', error);
  } finally {
    isKauflandSyncRunning = false;
  }
}

export function startKauflandSyncCronJob() {
  const syncIntervalMinutes = parseInt(process.env.KAUFLAND_SYNC_INTERVAL_MINUTES || '5', 10);
  const safeIntervalMinutes = Number.isFinite(syncIntervalMinutes) && syncIntervalMinutes > 0
    ? syncIntervalMinutes
    : 5;

  const intervalMs = safeIntervalMinutes * 60 * 1000;

  if (kauflandSyncIntervalRef) {
    clearInterval(kauflandSyncIntervalRef);
  }

  kauflandSyncIntervalRef = setInterval(() => {
    runKauflandSyncCycle();
  }, intervalMs);

  console.log(`[KAUFLAND CRON] Started background Kaufland sync every ${safeIntervalMinutes} minute(s)`);

  runKauflandSyncCycle();
}