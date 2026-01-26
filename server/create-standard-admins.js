import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Define standard admin accounts
const standardAdmins = [
  {
    name: 'Super Admin',
    email: 'admin@dropsyncr.com',
    password: 'Admin@123',
    role: 'admin',
    isGlobalAdmin: true,
  },
  {
    name: 'System Administrator',
    email: 'sysadmin@dropsyncr.com',
    password: 'SysAdmin@123',
    role: 'admin',
    isGlobalAdmin: true,
  },
  {
    name: 'Support Admin',
    email: 'support@dropsyncr.com',
    password: 'Support@123',
    role: 'admin',
    isGlobalAdmin: true,
  },
];

async function createStandardAdmins() {
  try {
    console.log('\n=== Creating Standard Administrators ===\n');

    for (const adminData of standardAdmins) {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: adminData.email },
      });

      if (existingUser) {
        // Update existing user to ensure they have admin privileges
        await prisma.user.update({
          where: { email: adminData.email },
          data: {
            isGlobalAdmin: true,
            role: 'admin',
            name: adminData.name,
          },
        });
        console.log(`✅ Updated existing user: ${adminData.email}`);
      } else {
        // Hash password
        const hashedPassword = await bcrypt.hash(adminData.password, 10);

        // Create new admin user
        await prisma.user.create({
          data: {
            email: adminData.email,
            password: hashedPassword,
            name: adminData.name,
            role: adminData.role,
            isGlobalAdmin: adminData.isGlobalAdmin,
          },
        });
        console.log(`✅ Created new admin: ${adminData.email}`);
      }
    }

    console.log('\n=== Standard Administrators Summary ===\n');
    standardAdmins.forEach((admin) => {
      console.log(`Email: ${admin.email}`);
      console.log(`Password: ${admin.password}`);
      console.log(`Name: ${admin.name}`);
      console.log('---');
    });

    console.log('\n⚠️  IMPORTANT: Change these default passwords in production!\n');
    
  } catch (error) {
    console.error('❌ Error creating standard admins:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createStandardAdmins();
