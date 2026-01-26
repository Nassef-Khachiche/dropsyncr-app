import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@dropsyncr.com' },
    update: {
      isGlobalAdmin: true, // Ensure admin is always a global admin
    },
    create: {
      email: 'admin@dropsyncr.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'admin',
      isGlobalAdmin: true,
    },
  });

  console.log('Created admin user:', admin.email);

  // Create installations (or get existing ones)
  const installationData = [
    {
      name: 'KLK Store 1',
      type: 'own',
      country: 'NL',
      active: true,
    },
    {
      name: 'KLK Store 2',
      type: 'own',
      country: 'NL',
      active: true,
    },
    {
      name: 'KLK Store 3',
      type: 'own',
      country: 'BE',
      active: true,
    },
    {
      name: 'Fulfilment Client A',
      type: 'fulfilment',
      country: 'NL',
      contract: 'Premium - €2.50/order',
      active: true,
    },
    {
      name: 'Fulfilment Client B',
      type: 'fulfilment',
      country: 'NL',
      contract: 'Standard - €2.00/order',
      active: true,
    },
  ];

  const installations = await Promise.all(
    installationData.map(data =>
      prisma.installation.findFirst({
        where: { name: data.name },
      }).then(existing => {
        if (existing) return existing;
        return prisma.installation.create({ data });
      })
    )
  );

  // Link admin to all installations
  for (const installation of installations) {
    await prisma.userInstallation.upsert({
      where: {
        userId_installationId: {
          userId: admin.id,
          installationId: installation.id,
        },
      },
      update: {},
      create: {
        userId: admin.id,
        installationId: installation.id,
      },
    });
  }

  console.log(`Created ${installations.length} installations`);

  // Get first installation for sample data
  const installation = installations[0];

  if (installation) {
    // Create sample products
    const products = await Promise.all([
      prisma.product.create({
        data: {
          installationId: installation.id,
          sku: 'ZAL-EMR-001',
          ean: '8721085278871',
          name: 'EMR Pen - Voor reMarkable 2 & Tablets - Stylus',
          image: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=200',
          brand: 'Zaltino',
          price: 39.95,
          totalStock: 54,
          availableStock: 48,
          fulfillmentStock: 50,
          salesPerMonth: 12,
          locations: {
            create: [
              { location: 'A-01-02', quantity: 30 },
              { location: 'B-03-01', quantity: 24 },
            ],
          },
        },
      }),
      prisma.product.create({
        data: {
          installationId: installation.id,
          sku: 'ZAL-WCH-002',
          ean: '8721085279144',
          name: 'Zaltino - Horloge met Trilwekker - 15 Alarmen - Zwart',
          image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200',
          brand: 'Zaltino',
          price: 29.95,
          totalStock: 182,
          availableStock: 175,
          fulfillmentStock: 180,
          salesPerMonth: 28,
          locations: {
            create: [
              { location: 'A-02-03', quantity: 100 },
              { location: 'C-01-05', quantity: 82 },
            ],
          },
        },
      }),
    ]);

    console.log(`Created ${products.length} sample products`);

    // Create sample orders
    const orders = await Promise.all([
      prisma.order.create({
        data: {
          orderNumber: 'A0009HICA9',
          installationId: installation.id,
          userId: admin.id,
          customerName: 'Karin Gebruge',
          address: 'Ouden Dendermondesteenweg 278, 9300 AALST, BE',
          country: 'BE',
          storeName: 'Shopcentral',
          platform: 'bol.com',
          orderDate: new Date('2024-10-14'),
          deliveryDate: new Date('2024-10-16'),
          orderStatus: 'openstaand',
          shippingStatus: 'Met Landmrankglobal',
          orderValue: 49.99,
          itemCount: 1,
          supplierTracking: 'TBA123456789012',
          status: 'onderweg-ffm',
          orderItems: {
            create: {
              productId: products[0].id,
              productName: 'EMR Pen - Voor reMarkable 2 & Tablets - Stylus',
              productImage: products[0].image,
              ean: products[0].ean,
              sku: products[0].sku,
              quantity: 1,
              price: 49.99,
              unitPrice: 49.99,
              weight: '12.9 kg',
              supplier: 'Amazon',
            },
          },
        },
      }),
      prisma.order.create({
        data: {
          orderNumber: 'A0009HAK3',
          installationId: installation.id,
          userId: admin.id,
          customerName: 'Sophie van Dam',
          address: 'Mosselscheerloop 14, 1234 AB Amsterdam, NL',
          country: 'NL',
          storeName: 'Inovra',
          platform: 'bol.com',
          orderDate: new Date('2024-10-14'),
          deliveryDate: new Date('2024-10-16'),
          orderStatus: 'openstaand',
          shippingStatus: 'PostNL Standaard 0-23kg',
          orderValue: 38.98,
          itemCount: 2,
          supplierTracking: 'LP987654321NL',
          status: 'binnengekomen-ffm',
          orderItems: {
            create: {
              productId: products[1].id,
              productName: 'Zaltino - Horloge met Trilwekker - 15 Alarmen - Zwart',
              productImage: products[1].image,
              ean: products[1].ean,
              sku: products[1].sku,
              quantity: 2,
              price: 38.98,
              unitPrice: 19.49,
              weight: '2.3 kg',
              supplier: 'AliExpress',
            },
          },
        },
      }),
    ]);

    console.log(`Created ${orders.length} sample orders`);

    // Create tracking for first order
    await prisma.tracking.create({
      data: {
        orderId: orders[0].id,
        trackingCode: 'TBA123456789012',
        supplier: 'Amazon',
        source: 'email',
        status: 'linked',
      },
    });

    console.log('Created sample tracking');
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

