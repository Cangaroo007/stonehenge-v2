const pg = require('pg');

const client = new pg.Client({
  connectionString: 'postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway'
});

async function main() {
  try {
    await client.connect();

    const results = {};

    // Query a: List all cutout types
    console.log('\n=== QUERY A: All Cutout Types ===');
    const a = await client.query(`
      SELECT id, name, "baseRate", "isActive", "sortOrder" 
      FROM cutout_types 
      ORDER BY name
    `);
    results.allCutoutTypes = a.rows;
    console.log(JSON.stringify(a.rows, null, 2));

    // Query b: Cutout category rates
    console.log('\n=== QUERY B: Cutout Category Rates ===');
    const b = await client.query(`
      SELECT ct.name, ccr."fabricationCategory", ccr.rate, ccr.id as rate_id, ct.id as type_id
      FROM cutout_category_rates ccr
      JOIN cutout_types ct ON ct.id = ccr."cutoutTypeId"
      ORDER BY ct.name, ccr."fabricationCategory"
    `);
    results.categoryRates = b.rows;
    console.log(JSON.stringify(b.rows, null, 2));

    // Query c: Quote pieces with cutouts
    console.log('\n=== QUERY C: Quote Pieces with Cutouts (limit 20) ===');
    const c = await client.query(`
      SELECT id, name, cutouts 
      FROM quote_pieces 
      WHERE cutouts IS NOT NULL 
        AND cutouts::text != '[]' 
        AND cutouts::text != 'null' 
      LIMIT 20
    `);
    results.quotePieces = c.rows;
    console.log(JSON.stringify(c.rows, null, 2));

    // Query d: Count unique vs total
    console.log('\n=== QUERY D: Unique Names Count ===');
    const d = await client.query(`
      SELECT COUNT(*) as total_rows, COUNT(DISTINCT LOWER(name)) as unique_names 
      FROM cutout_types
    `);
    results.counts = d.rows;
    console.log(JSON.stringify(d.rows, null, 2));

    // Query e: Find exact duplicates (case-insensitive)
    console.log('\n=== QUERY E: Case-Insensitive Duplicates ===');
    const e = await client.query(`
      SELECT LOWER(name) as normalized_name, COUNT(*) as count, 
             array_agg(id) as ids, array_agg(name) as names
      FROM cutout_types
      GROUP BY LOWER(name)
      HAVING COUNT(*) > 1
      ORDER BY normalized_name
    `);
    results.duplicates = e.rows;
    console.log(JSON.stringify(e.rows, null, 2));

    // Query f: All cutout types with rate for similarity analysis
    console.log('\n=== QUERY F: All Cutout Types (for review) ===');
    const f = await client.query(`
      SELECT id, name, "baseRate" 
      FROM cutout_types 
      ORDER BY name
    `);
    results.allTypesForReview = f.rows;
    console.log(JSON.stringify(f.rows, null, 2));

    // Query g: Edge types
    console.log('\n=== QUERY G: Edge Types (for comparison) ===');
    const g = await client.query(`
      SELECT id, name, code, "rate20mm", "rate40mm", "isActive", "sortOrder" 
      FROM edge_types 
      ORDER BY "sortOrder"
    `);
    results.edgeTypes = g.rows;
    console.log(JSON.stringify(g.rows, null, 2));

    const fs = require('fs');
    fs.writeFileSync('/tmp/cutout-diagnosis.json', JSON.stringify(results, null, 2));
    console.log('\n=== Results saved to /tmp/cutout-diagnosis.json ===');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

main();
