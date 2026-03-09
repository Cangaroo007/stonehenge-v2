import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

export interface ParsedMaterial {
  productCode: string | null;
  name: string;
  surfaceFinish: string;
  range: string;
  wholesalePrice: number;
  costPrice: number;
  slabLengthMm: number;
  slabWidthMm: number;
  thicknessMm: number;
  isDiscontinued: boolean;
  notes: string | null;
}

export interface PriceListParseResult {
  supplierName: string;
  effectiveDate: string | null;
  currency: string;
  pricesExGst: boolean;
  materials: ParsedMaterial[];
  rawResponse: string;
}

const EXTRACTION_PROMPT = `You are a data extraction specialist for the Australian stone benchtop industry.
You are reading a supplier price list PDF addressed to "Northcoast Stone".

Extract EVERY material/product from this price list into a structured JSON format.

For EACH material, extract:
- productCode: The supplier's product code/number (e.g. "5131", "CM 1453"). Null if no code exists.
- name: The product/colour name (e.g. "Calacatta Nuvo", "Arctic White")
- surfaceFinish: "Polished", "Matte", or "Textured"
- range: The range/tier name (e.g. "Builder Range", "Premium Plus", "M2 20 CSF")
- wholesalePrice: The standard/wholesale price per slab in AUD (before any customer discount)
- costPrice: Northcoast Stone's actual price per slab (after discount). If only one price shown, use it for both.
- slabLengthMm: Slab length in mm (the LONGER dimension). Convert from any format.
- slabWidthMm: Slab width in mm (the SHORTER dimension). Convert from any format.
- thicknessMm: Slab thickness in mm (typically 12 or 20)
- isDiscontinued: true if marked as discontinued, false otherwise
- notes: Any special notes (e.g. "Book-Match available", "New", "Back to back order only")

IMPORTANT RULES:
1. Prices are ALWAYS ex-GST (this is standard in the Australian stone industry)
2. PRICE COLUMN DETECTION RULES — MANDATORY:
   a) PER-M² REFERENCE COLUMN (not a real price):
      A numeric column is a per-m² reference figure — NOT a separate price — when ANY of:
      - The column header contains "m²", "sqm", "per m", "per square", "m2"
      - The value ≈ the slab price ÷ slab area in m² (within 5% tolerance)
      - The ratio slab_price ÷ this_value falls between 4.0 and 7.0 (typical slab area range)
      When detected: store slab price as wholesalePrice. Derive price per m² by dividing
      wholesalePrice by slab area. Do NOT treat the per-m² column as costPrice or a second price.
      Do NOT raise a clarification question about it. Use the slab price for BOTH wholesalePrice and costPrice.
   b) GENUINE DUAL PRICE (both real prices):
      Two real prices exist only when column headers explicitly say:
      - "Wholesale" / "Wholesale Price" AND "VIP" / "Your Price" / "Net" / "Your VIP Price"
      In this case: wholesalePrice = the higher figure, costPrice = the lower figure.
   c) SINGLE PRICE WITH DISCOUNT:
      When a document shows a wholesale price, a discount %, and a resulting net price:
      wholesalePrice = the pre-discount figure, costPrice = the post-discount figure.
   d) SINGLE PRICE, NO DISCOUNT:
      If only one price is shown with no discount information, use it for both wholesalePrice and costPrice.
3. NEVER raise a clarification question about a per-m² reference column. It is not a second price.
4. Slab dimensions: ALWAYS put the longer dimension as slabLengthMm and shorter as slabWidthMm, regardless of how the PDF lists them (some list Width×Length).
5. Include ALL products, even discontinued ones (mark isDiscontinued: true)
6. The supplier name should be extracted from the PDF header/logo
7. Look for an effective date in the document

Also extract:
- supplierName: The supplier company name
- effectiveDate: When this price list takes effect (null if not stated)
- pricesExGst: Should always be true for Australian industry

Respond with ONLY valid JSON, no markdown backticks, no explanation. Format:
{
  "supplierName": "...",
  "effectiveDate": "YYYY-MM-DD" or null,
  "currency": "AUD",
  "pricesExGst": true,
  "materials": [
    {
      "productCode": "..." or null,
      "name": "...",
      "surfaceFinish": "...",
      "range": "...",
      "wholesalePrice": 0.00,
      "costPrice": 0.00,
      "slabLengthMm": 0,
      "slabWidthMm": 0,
      "thicknessMm": 20,
      "isDiscontinued": false,
      "notes": null
    }
  ]
}`;

export async function parsePriceListPdf(
  pdfBase64: string,
  mediaType: 'application/pdf' = 'application/pdf'
): Promise<PriceListParseResult> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: pdfBase64,
            },
          },
          {
            type: 'text',
            text: EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b: { type: string }) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  const rawResponse = textBlock.text;

  // Parse JSON — strip any accidental markdown fencing
  const cleanJson = rawResponse.replace(/```json\n?|```\n?/g, '').trim();
  const parsed = JSON.parse(cleanJson) as PriceListParseResult;

  if (!parsed.materials || !Array.isArray(parsed.materials)) {
    throw new Error('Invalid parse result: no materials array');
  }

  // Normalise dimensions (ensure length > width)
  for (const mat of parsed.materials) {
    if (mat.slabLengthMm < mat.slabWidthMm) {
      const temp = mat.slabLengthMm;
      mat.slabLengthMm = mat.slabWidthMm;
      mat.slabWidthMm = temp;
    }
  }

  parsed.rawResponse = rawResponse;
  return parsed;
}
