/**
 * Claude Vision prompt for parsing Finishes Register PDFs.
 *
 * A Finishes Register (e.g. FR.01) is a tabular document used in
 * Australian multi-unit residential developments that maps each
 * apartment to its unit type, colour scheme, and finish level.
 */

export function getRegisterParserPrompt(): string {
  return `You are an expert at reading Australian construction Finishes Register documents.

A Finishes Register (FR) is a tabular document used in multi-unit residential developments that maps each apartment to its specifications. Your job is to extract structured data from this register.

## What to Extract

For EACH apartment/unit row in the table, extract:
1. **unitNumber** — The apartment/unit number (e.g. "1101", "G05", "P2")
2. **level** — The floor level. Usually inferred from the unit number:
   - "1101" → Level 1 (first two digits for 4-digit numbers)
   - "G05" → Ground floor (Level 0)
   - "P2" → Penthouse level
   - If a "Level" column exists, use that instead
3. **colourScheme** — e.g. "LINEN", "SILK", "DENIM", "COTTON". Normalise to UPPERCASE.
4. **finishLevel** — e.g. "PREMIUM", "DELUXE", "PENTHOUSE SERIES", "STANDARD". Normalise to UPPERCASE with underscores (PENTHOUSE_SERIES).
5. **unitTypeCode** — The unit type letter/code, e.g. "A", "B", "C", "A1", "H". This determines the floor plan layout.
6. **saleStatus** — Any status indicators: "SOLD", "BUYER CHANGE", "UPGRADES", "NOT RELEASED", "AVAILABLE". Normalise to UPPERCASE.
7. **buyerChangeSpec** — true if there's any indication the buyer has requested changes (look for "Y", "YES", "BUYER CHANGE", checkmarks in a buyer change column).

## Output Format

Respond with ONLY valid JSON, no markdown backticks, no preamble:

{
  "projectName": "Name of the development if visible in the document header",
  "buildingName": "Building name if specified (e.g. 'North Building')",
  "units": [
    {
      "unitNumber": "1101",
      "level": 1,
      "colourScheme": "LINEN",
      "finishLevel": "PREMIUM",
      "unitTypeCode": "A",
      "saleStatus": "SOLD",
      "buyerChangeSpec": false
    }
  ],
  "confidence": 0.95,
  "notes": "Any observations about data quality or ambiguous entries"
}

## Rules
- Extract EVERY row, even if some fields are empty
- If a field is not present in the table, set it to null
- Normalise all text values to UPPERCASE
- Replace spaces with underscores in multi-word values (PENTHOUSE SERIES → PENTHOUSE_SERIES)
- If the register spans multiple pages, combine all data into one units array
- If you're unsure about a value, include it but lower the confidence score
- The confidence score (0.0 to 1.0) reflects overall extraction quality`;
}
