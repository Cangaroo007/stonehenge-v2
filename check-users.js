const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Checking for users...');
  
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, is_active: true }
  });
  
  console.log('Users found:', users);
  
  if (users.length === 0) {
    console.log('No users found. Creating admin user...');
    
    const passwordHash = await bcrypt.hash('demo1234', 10);
    
    const user = await prisma.user.create({
      data: {
        email: 'admin@northcoaststone.com.au',
        password_hash: passwordHash,
        name: 'Admin User',
        is_active: true,
        role: 'ADMIN',
      }
    });
    
    console.log('✅ Created user:', user.email);
  } else {
    console.log(`Found ${users.length} user(s).`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
