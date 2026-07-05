import prisma from '../config/database.js';
import { syncBricoBravoOrdersForInstallation } from '../controllers/bricobravocontroller.js';

// BricoBravo job: draait elke X minuten (configureerbaar via BRICOBRAVO_SYNC_INTERVAL_MINUTES)
// en synchroniseert orders voor alle actieve BricoBravo-integraties. Elke cyclus checkt of
// een vorige sync nog loopt om overlap te voorkomen.
let bricoBravoSyncIntervalRef = null;
let isBricoBravoSyncRunning = false;

async function runBricoBravoSyncCycle() {
  if (isBricoBravoSyncRunning) {
    console.log('[BRICOBRAVO CRON] Previous sync cycle still running; skipping this run');
    return;
  }

  isBricoBravoSyncRunning = true;

  try {
    const activeIntegrations = await prisma.integration.findMany({
      where: {
        platform: 'bricobravo',
        active: true,
      },
      select: {
        id: true,
        installationId: true,
      },
    });

    if (activeIntegrations.length === 0) {
      console.log('[BRICOBRAVO CRON] No active BricoBravo integrations found');
      return;
    }

    console.log(`[BRICOBRAVO CRON] Starting sync cycle for ${activeIntegrations.length} integration(s)`);

    for (const integration of activeIntegrations) {
      try {
        const result = await syncBricoBravoOrdersForInstallation({
          installationId: integration.installationId,
          integrationId: integration.id,
        });

        console.log('[BRICOBRAVO CRON] Sync completed', {
          integrationId: integration.id,
          installationId: integration.installationId,
          imported: result.imported,
          updated: result.updated,
          total: result.total,
          reconciliation: result.reconciliation,
        });
      } catch (installationError) {
        console.error('[BRICOBRAVO CRON] Sync failed for installation', {
          integrationId: integration.id,
          installationId: integration.installationId,
          error: installationError.message,
        });
      }
    }
  } catch (error) {
    console.error('[BRICOBRAVO CRON] Failed to execute sync cycle:', error);
  } finally {
    isBricoBravoSyncRunning = false;
  }
}

export function startBricoBravoSyncCronJob() {
  const syncIntervalMinutes = parseInt(process.env.BRICOBRAVO_SYNC_INTERVAL_MINUTES || '10', 10);
  const safeIntervalMinutes = Number.isFinite(syncIntervalMinutes) && syncIntervalMinutes > 0
    ? syncIntervalMinutes
    : 5;

  const intervalMs = safeIntervalMinutes * 60 * 1000;

  if (bricoBravoSyncIntervalRef) {
    clearInterval(bricoBravoSyncIntervalRef);
  }

  bricoBravoSyncIntervalRef = setInterval(() => {
    runBricoBravoSyncCycle();
  }, intervalMs);

  console.log(`[BRICOBRAVO CRON] Started background BricoBravo sync every ${safeIntervalMinutes} minute(s)`);

  runBricoBravoSyncCycle();
}