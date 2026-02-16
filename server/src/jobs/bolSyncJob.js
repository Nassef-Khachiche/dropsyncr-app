import prisma from '../config/database.js';
import { syncBolOrdersForInstallation } from '../controllers/bolController.js';

let bolSyncIntervalRef = null;
let isBolSyncRunning = false;

async function runBolSyncCycle() {
  if (isBolSyncRunning) {
    console.log('[BOL CRON] Previous sync cycle still running; skipping this run');
    return;
  }

  isBolSyncRunning = true;

  try {
    const activeIntegrations = await prisma.integration.findMany({
      where: {
        platform: 'bol.com',
        active: true,
      },
      select: {
        installationId: true,
      },
      distinct: ['installationId'],
    });

    if (activeIntegrations.length === 0) {
      console.log('[BOL CRON] No active Bol.com integrations found');
      return;
    }

    console.log(`[BOL CRON] Starting sync cycle for ${activeIntegrations.length} installation(s)`);

    for (const integration of activeIntegrations) {
      try {
        const result = await syncBolOrdersForInstallation({
          installationId: integration.installationId,
        });

        console.log('[BOL CRON] Sync completed', {
          installationId: integration.installationId,
          imported: result.imported,
          updated: result.updated,
          total: result.total,
        });
      } catch (installationError) {
        console.error('[BOL CRON] Sync failed for installation', {
          installationId: integration.installationId,
          error: installationError.message,
        });
      }
    }
  } catch (error) {
    console.error('[BOL CRON] Failed to execute sync cycle:', error);
  } finally {
    isBolSyncRunning = false;
  }
}

export function startBolSyncCronJob() {
  const syncIntervalMinutes = parseInt(process.env.BOL_SYNC_INTERVAL_MINUTES || '5', 10);
  const safeIntervalMinutes = Number.isFinite(syncIntervalMinutes) && syncIntervalMinutes > 0
    ? syncIntervalMinutes
    : 5;

  const intervalMs = safeIntervalMinutes * 60 * 1000;

  if (bolSyncIntervalRef) {
    clearInterval(bolSyncIntervalRef);
  }

  bolSyncIntervalRef = setInterval(() => {
    runBolSyncCycle();
  }, intervalMs);

  console.log(`[BOL CRON] Started background Bol sync every ${safeIntervalMinutes} minute(s)`);

  runBolSyncCycle();
}
