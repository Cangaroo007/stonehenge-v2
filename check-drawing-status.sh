#!/bin/bash
# Quick script to check drawing upload status

echo "📊 Checking Drawing Database Status..."
echo "======================================="

psql "postgresql://postgres:zGGjJbAZMlmLMwoQSoWeIiTcvOQiolBa@interchange.proxy.rlwy.net:34386/railway" -c "
SELECT 
  id, 
  filename, 
  \"storageKey\", 
  \"quoteId\",
  \"uploadedAt\"
FROM \"Drawing\" 
ORDER BY \"uploadedAt\" DESC 
LIMIT 5;
"

echo ""
echo "📊 Total Drawings Count:"
psql "postgresql://postgres:zGGjJbAZMlmLMwoQSoWeIiTcvOQiolBa@interchange.proxy.rlwy.net:34386/railway" -c "
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN \"storageKey\" IS NOT NULL THEN 1 END) as with_storage_key,
  COUNT(CASE WHEN \"storageKey\" IS NULL THEN 1 END) as missing_storage_key
FROM \"Drawing\";
"
