const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const newPassword = 'demo1234';
  const passwordHash = await bcrypt.hash(newPassword, 10);
  
  const user = await prisma.user.update({
    where: { email: 'admin@northcoaststone.com.au' },
    data: { password_hash: passwordHash }
  });
  
  console.log('✅ Password reset for:', user.email);
  console.log('   New password:', newPassword);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
