import prisma from './src/config/database.js';

async function checkAdmins() {
  try {
    console.log('Checking users in database...\n');
    
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isGlobalAdmin: true,
      },
    });

    console.log(`Found ${users.length} user(s):\n`);
    
    users.forEach(user => {
      console.log(`ID: ${user.id}`);
      console.log(`Email: ${user.email}`);
      console.log(`Name: ${user.name}`);
      console.log(`Role: ${user.role}`);
      console.log(`isGlobalAdmin: ${user.isGlobalAdmin} (type: ${typeof user.isGlobalAdmin}, value: ${user.isGlobalAdmin === true ? 'TRUE' : user.isGlobalAdmin === false ? 'FALSE' : 'OTHER'})`);
      console.log(`isGlobalAdmin === true: ${user.isGlobalAdmin === true}`);
      console.log(`isGlobalAdmin === 1: ${user.isGlobalAdmin === 1}`);
      console.log(`Boolean(isGlobalAdmin): ${Boolean(user.isGlobalAdmin)}`);
      console.log('---\n');
    });

    const globalAdmins = users.filter(u => u.isGlobalAdmin === true || u.isGlobalAdmin === 1);
    console.log(`Global admins: ${globalAdmins.length}`);
    if (globalAdmins.length > 0) {
      console.log('Global admin emails:', globalAdmins.map(u => u.email).join(', '));
    } else {
      console.log('\n⚠️  WARNING: No global admins found!');
      console.log('You need to set at least one user as a global admin.');
      console.log('\nTo fix this, you can run:');
      console.log('node update-admin.js <email>');
    }
    
  } catch (error) {
    console.error('Error checking admins:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAdmins();
