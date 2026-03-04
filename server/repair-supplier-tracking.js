import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const hasArg = (arg) => process.argv.includes(arg);
const getArgValue = (name, fallback) => {
  const match = process.argv.find((entry) => entry.startsWith(`${name}=`));
  if (!match) return fallback;
  const [, value] = match.split('=');
  return value ?? fallback;
};

const normalize = (value) => String(value || '').trim().toLowerCase();

async function repairSupplierTracking() {
  const applyChanges = hasArg('--apply');
  const requireGeneratedLabel = !hasArg('--no-label-check');
  const maxRows = Number.parseInt(getArgValue('--limit', '5000'), 10);
  const take = Number.isNaN(maxRows) || maxRows <= 0 ? 5000 : maxRows;

  try {
    console.log('\n=== Supplier Tracking Repair ===');
    console.log(`Mode: ${applyChanges ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Require generated label: ${requireGeneratedLabel ? 'yes' : 'no'}`);
    console.log(`Limit: ${take}`);

    const whereClause = {
      supplierTracking: { not: null },
      tracking: {
        is: {
          source: { in: ['manual', 'email'] },
        },
      },
      ...(requireGeneratedLabel
        ? {
            label: {
              is: {
                status: 'generated',
              },
            },
          }
        : {}),
    };

    const orders = await prisma.order.findMany({
      where: whereClause,
      select: {
        id: true,
        orderNumber: true,
        supplierTracking: true,
        tracking: {
          select: {
            trackingCode: true,
            source: true,
          },
        },
      },
      take,
      orderBy: { updatedAt: 'desc' },
    });

    const repairCandidates = orders.filter((order) => {
      const orderSupplierTracking = normalize(order.supplierTracking);
      const linkedTrackingCode = normalize(order.tracking?.trackingCode);
      return Boolean(orderSupplierTracking) && Boolean(linkedTrackingCode) && orderSupplierTracking !== linkedTrackingCode;
    });

    console.log(`Orders scanned: ${orders.length}`);
    console.log(`Repair candidates: ${repairCandidates.length}`);

    if (repairCandidates.length === 0) {
      console.log('No eligible records found.');
      return;
    }

    const preview = repairCandidates.slice(0, 20);
    console.log('\nPreview (first 20):');
    preview.forEach((entry) => {
      console.log(`- #${entry.id} ${entry.orderNumber}: supplierTracking="${entry.supplierTracking}" -> "${entry.tracking.trackingCode}" (source=${entry.tracking.source})`);
    });

    if (!applyChanges) {
      console.log('\nDry-run complete. Re-run with --apply to persist changes.');
      return;
    }

    const operations = repairCandidates.map((entry) => prisma.order.update({
      where: { id: entry.id },
      data: { supplierTracking: entry.tracking.trackingCode },
      select: { id: true },
    }));

    const result = await prisma.$transaction(operations);

    console.log(`\nUpdated ${result.length} orders.`);
  } catch (error) {
    console.error('Repair failed:', error?.message || error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

repairSupplierTracking();
