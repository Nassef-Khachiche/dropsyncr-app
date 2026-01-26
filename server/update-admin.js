import prisma from './src/config/database.js';

async function updateAdmin() {
  try {
    const email = process.argv[2];
    
    if (!email) {
      console.error('Please provide an email address');
      console.log('Usage: node update-admin.js <email>');
      process.exit(1);
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.error(`User with email ${email} not found`);
      process.exit(1);
    }

    await prisma.user.update({
      where: { email },
      data: { isGlobalAdmin: true },
    });

    console.log(`✅ Successfully updated ${email} to be a global admin`);
    
  } catch (error) {
    console.error('Error updating admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateAdmin();
