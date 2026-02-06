import { classifyDocument } from '../src/lib/services/drawing-analyzer';
import * as fs from 'fs';
import * as path from 'path';

async function testClassification() {
  const testImagePath = process.argv[2];

  if (!testImagePath) {
    console.log('Usage: npx tsx scripts/test-classification.ts <image-path>');
    process.exit(1);
  }

  const imageBuffer = fs.readFileSync(testImagePath);
  const base64 = imageBuffer.toString('base64');
  const ext = path.extname(testImagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

  console.log('Classifying document...');
  const result = await classifyDocument(base64, mimeType);

  console.log('\nResult:');
  console.log(JSON.stringify(result, null, 2));
}

testClassification().catch(console.error);
