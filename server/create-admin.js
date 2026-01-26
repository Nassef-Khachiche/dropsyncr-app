import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'readline';

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function createAdmin() {
  try {
    console.log('\n=== Create Global Administrator ===\n');

    // Get admin details from user input
    const name = await question('Enter admin name: ');
    const email = await question('Enter admin email: ');
    const password = await question('Enter admin password: ');

    if (!name || !email || !password) {
      console.error('❌ All fields are required');
      process.exit(1);
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      console.log(`\n⚠️  User with email ${email} already exists`);
      const update = await question('Do you want to update this user to be a global admin? (yes/no): ');
      
      if (update.toLowerCase() === 'yes' || update.toLowerCase() === 'y') {
        await prisma.user.update({
          where: { email },
          data: { 
            isGlobalAdmin: true,
            role: 'admin',
            name: name // Update name if provided
          },
        });
        console.log(`✅ Successfully updated ${email} to be a global admin`);
      } else {
        console.log('❌ Operation cancelled');
      }
    } else {
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create new admin user
      const admin = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: 'admin',
          isGlobalAdmin: true,
        },
      });

      console.log(`\n✅ Successfully created global admin: ${admin.email}`);
      console.log(`   Name: ${admin.name}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   Global Admin: ${admin.isGlobalAdmin}`);
    }
    
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

createAdmin();
