/**
 * Claude Vision prompt for parsing Finishes Register PDFs.
 *
 * A Unit Register (also called Finishes Register, Schedule of Finishes,
 * Unit Allocation Table, or Lot Schedule) is a tabular document used in
 * multi-unit developments. It maps every unit/lot/tenancy to its
 * specifications. The prompt handles any register format adaptively.
 */

export function getRegisterParserPrompt(): string {
  return `You are an expert at reading construction unit register documents from Australia and internationally.

A Unit Register (also called Finishes Register, Schedule of Finishes, Unit Allocation Table, or Lot Schedule) is a tabular document used in multi-unit developments. It maps every unit/lot/tenancy in a project to its specifications. Your job is to extract structured data from this register.

## IMPORTANT: Adaptive Extraction

These documents vary significantly between builders, architects, and project types. Do NOT assume a fixed column layout. Instead:

1. First, identify what columns exist in the table
2. Map each column to the closest matching output field (see below)
3. If a column doesn't map to any output field, include it in the "additionalFields" object
4. If an output field has no matching column, set it to null

## Output Fields to Extract

For each row (unit) in the table, extract:

1. **unitNumber** — The unit/lot/apartment/tenancy identifier. This could be:
   - Apartment numbers (1101, 2B, 304)
   - Lot numbers (Lot 1, TH01, L12)
   - Tenancy IDs (G01, T1-04)
   - Villa/dwelling numbers (V01, D3)
   - Any other unique identifier per row

2. **level** — The floor/level if applicable. Look for:
   - Explicit "LEVEL X" or "FLOOR X" headers or columns
   - Level embedded in the unit number (1101 → Level 1, 304 → Level 3) — but ONLY if the document appears to use this convention
   - "Ground", "G", "Basement", "B1" etc.
   - Set to null if the development has no levels (e.g., single-storey townhouses)

3. **colourScheme** — Design/colour package name if present (e.g., "Linen", "Denim", "Scheme A", "Pacific"). Free text, normalise to UPPERCASE. Set to null if no such column exists.

4. **finishLevel** — Finish tier/grade if present (e.g., "Deluxe", "Premium", "Standard", "Platinum", "Spec A"). Free text, normalise to UPPERCASE. Set to null if no such column exists.

5. **unitTypeCode** — Unit type/dwelling type identifier (e.g., "A", "Type 1", "3B2B", "Villa A"). Free text, normalise to UPPERCASE. Set to null if not present.

6. **saleStatus** — Any status/comment column indicating sale or contract status (e.g., "SOLD", "AVAILABLE", "CONTRACTED", "BUYER CHANGE", "UPGRADES", "RESERVED", "NOT RELEASED"). Normalise to UPPERCASE. Set to null if not present.

7. **buyerChangeSpec** — true if there is ANY indication the buyer has requested changes or customisations. Look for: "Y", "YES", "BUYER CHANGE", "TBC", "CUSTOM", checkmarks, or any dedicated buyer change column. Default to false if unclear.

8. **additionalFields** — A JSON object containing any extra columns from the table that don't map to the fields above. For example: { "bedrooms": "3", "parking": "2", "orientation": "North" }

## Output Format

Respond with ONLY valid JSON, no markdown backticks, no preamble:

{
  "projectName": "Name of the development if visible in the document header/title",
  "buildingName": "Building name if specified (e.g. 'North Building', 'Tower A')",
  "projectType": "APARTMENTS | TOWNHOUSES | VILLAS | COMMERCIAL | MIXED | UNKNOWN",
  "detectedColumns": ["Floor/Apt", "Colour Scheme", "Finish Level", "Unit Type", "Comments", "Buyer Change"],
  "units": [
    {
      "unitNumber": "1101",
      "level": 1,
      "colourScheme": "LINEN",
      "finishLevel": "PREMIUM",
      "unitTypeCode": "A",
      "saleStatus": "SOLD",
      "buyerChangeSpec": false,
      "additionalFields": {}
    }
  ],
  "confidence": 0.95,
  "notes": "Any observations about the document format, data quality, or ambiguous entries"
}

## Rules
- Extract EVERY data row, even if some fields are empty
- If a field has no corresponding column in the table, set it to null
- Normalise all text values to UPPERCASE
- Replace spaces with underscores in multi-word values (PENTHOUSE SERIES → PENTHOUSE_SERIES)
- If the register spans multiple pages, combine all data into one units array
- Do NOT include section headers (e.g., "LEVEL 1", "BLOCK A") as unit entries — use them as context for the units below them
- The "detectedColumns" array should list the actual column headers from the document
- Include "projectType" based on the document content (apartment numbering patterns, document title, etc.)
- If you're unsure about a value, include it but lower the confidence score
- The confidence score (0.0 to 1.0) reflects overall extraction quality`;
}
