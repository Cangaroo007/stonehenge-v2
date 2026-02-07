-- Quick seed: Create admin user for stonehenge-v2
-- Password: demo1234 (bcrypt hash below)

INSERT INTO "User" (id, email, "passwordHash", name, "createdAt", "updatedAt")
VALUES (
  1,
  'admin@northcoaststone.com.au',
  '$2a$10$rZ5fGKs7fP6q2WvJxHx6Uezl0KbXqPKkx7KqN0X.YvJxHx6Uezl0K',
  'Admin User',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  "passwordHash" = EXCLUDED."passwordHash",
  name = EXCLUDED.name;

-- Verify
SELECT id, email, name FROM "User" WHERE email = 'admin@northcoaststone.com.au';
