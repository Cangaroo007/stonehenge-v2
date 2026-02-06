import Anthropic from '@anthropic-ai/sdk';

// Re-export types from the shared types file so server-side consumers
// can continue importing from this module without breaking changes.
export {
  ServiceCategory,
  CutoutType,
} from '@/lib/types/price-interpreter';

export type {
  PriceMapping,
  TierPriceMapping,
  InterpretationResult,
} from '@/lib/types/price-interpreter';

import {
  ServiceCategory,
  type TierPriceMapping,
  type InterpretationResult,
} from '@/lib/types/price-interpreter';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-5-20250929';

const AI_SYSTEM_PROMPT = `You are an expert in Australian Stone Masonry and stone fabrication pricing. Your job is to analyze uploaded price lists (CSV or spreadsheet data) and map the columns and rows to our internal pricing categories.

# Internal Categories (ENUMS):
- SLAB: Material/slab pricing (e.g., Caesarstone, Smartstone, natural stone per square metre or per slab)
- CUTTING: Cutting services (usually per linear metre, may vary by thickness)
- POLISHING: Edge polishing (per linear metre, may have thickness variations for 20mm vs 40mm)
- CUTOUT: Cutouts like sinks, cooktops, tap holes (usually fixed price per item)
- DELIVERY: Delivery charges (may be per kilometre or fixed fee)
- INSTALLATION: Installation services (per square metre or fixed rate)

# Cutout Types (if category is CUTOUT):
- HOTPLATE: Hotplate/cooktop electrical cutout
- GPO: General power outlet cutout
- TAP_HOLE: Tap hole drilling
- DROP_IN_SINK: Drop-in sink cutout
- UNDERMOUNT_SINK: Undermount sink cutout (also known as "Sink Hole")
- FLUSH_COOKTOP: Flush-mount cooktop cutout
- BASIN: Basin cutout
- DRAINER_GROOVES: Drainer groove cutting
- OTHER: Any other cutout type

# Australian Standards (CRITICAL):
- ALL units MUST use Australian spelling: "Metre" (NOT "Meter"), "Millimetre" (NOT "Millimeter"), "Square Metre" (NOT "Square Meter")
- Prices are in AUD ($)
- Industry terms: "lm" = linear metre, "sqm" = square metre, "ea" = each (fixed)

# Mapping Rules:
1. Analyze headers and row data to understand the pricing structure
2. Map each row to ONE of our service categories
3. For thickness-specific rates (20mm, 40mm), populate both rate20mm and rate40mm
4. Convert all measurements to metres if needed (e.g., "1000mm" → "1 Metre")
5. Standardize units: "lm", "lin m", "linear meter" → "Metre"
6. Mark confidence: high (obvious match), medium (reasonable guess), low (unclear)
7. Add notes for any ambiguities or special handling needed

# Common Australian Stone Industry Mappings:
- "Sink Hole", "Sink hole cut", "Cooktop cutout" → CUTOUT (with appropriate cutoutType)
- "Sink Hole" specifically → CUTOUT with cutoutType UNDERMOUNT_SINK
- "Edge polish", "Polished edge", "Pencil round" → POLISHING
- "Cutting", "Cut line", "Mitre cut" → CUTTING
- "Material", "Slab cost", "Stone" → SLAB
- "Install", "Fitting", "Fix" → INSTALLATION
- "Freight", "Transport", "Delivery" → DELIVERY

Return a JSON array of PriceMapping objects.`;

const AI_USER_PROMPT = (fileContent: string, fileType: string) => `Please analyze this ${fileType} price list data and map it to our internal categories:

\`\`\`
${fileContent}
\`\`\`

Return ONLY a valid JSON array following the PriceMapping interface structure. Do not include any markdown formatting or explanatory text.

Each object must have:
- originalCategory (string): The original column/section from the spreadsheet
- originalName (string): The item name as it appears
- originalRate (number): The price value
- serviceCategory (string): One of SLAB, CUTTING, POLISHING, CUTOUT, DELIVERY, INSTALLATION
- cutoutType (string, optional): If CUTOUT, specify the type
- rate20mm (number, optional): Rate for 20mm thickness
- rate40mm (number, optional): Rate for 40mm thickness
- unit (string): Must be "Metre", "Millimetre", "Square Metre", or "Fixed" (Australian spelling!)
- confidence (string): "high", "medium", or "low"
- notes (string, optional): Any relevant notes`;

/**
 * Process a price list file upload through AI interpretation.
 * This is the primary entry point for Task 3.3.
 *
 * @param fileContent - Raw text/CSV content of the uploaded file
 * @param fileType - File type descriptor (e.g., 'csv', 'text', 'xlsx-parsed')
 * @returns Interpreted price mappings with summary statistics
 */
export async function processPriceListUpload(
  fileContent: string,
  fileType: string
): Promise<InterpretationResult> {
  try {
    // Pre-process based on file type
    let processedContent = fileContent;
    if (fileType === 'csv' || fileType === 'text/csv') {
      const parsed = parseCSV(fileContent);
      processedContent = formatDataForAI(parsed);
    }

    // Call Anthropic API
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: AI_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: AI_USER_PROMPT(processedContent, fileType),
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find((c: { type: string }) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in AI response');
    }

    // Parse JSON response (using Railway-safe double-cast pattern)
    let mappings: TierPriceMapping[];
    try {
      const parsed = JSON.parse(textContent.text);
      const mappedData = parsed as unknown as TierPriceMapping[];
      mappings = mappedData;
    } catch (parseError) {
      throw new Error(
        `Failed to parse AI response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
      );
    }

    // Validate and normalize mappings
    const validatedMappings = mappings.map((mapping) => ({
      ...mapping,
      // Ensure Australian spelling for units
      unit: normalizeUnit(mapping.unit),
    }));

    // Use Array.from(new Set()) for unique category filtering (Railway-safe, no spread syntax)
    const uniqueCategories = Array.from(
      new Set(validatedMappings.map((m) => m.serviceCategory))
    );

    // Calculate summary statistics
    const categoryCounts: Record<ServiceCategory, number> = {
      [ServiceCategory.SLAB]: 0,
      [ServiceCategory.CUTTING]: 0,
      [ServiceCategory.POLISHING]: 0,
      [ServiceCategory.CUTOUT]: 0,
      [ServiceCategory.DELIVERY]: 0,
      [ServiceCategory.INSTALLATION]: 0,
    };

    let totalConfidence = 0;
    const warnings: string[] = [];

    validatedMappings.forEach((mapping) => {
      categoryCounts[mapping.serviceCategory]++;

      // Calculate confidence score (high=1, medium=0.5, low=0.25)
      totalConfidence += mapping.confidence === 'high' ? 1 : mapping.confidence === 'medium' ? 0.5 : 0.25;

      // Collect warnings for low-confidence mappings
      if (mapping.confidence === 'low') {
        warnings.push(
          `Low confidence mapping: "${mapping.originalName}" → ${mapping.serviceCategory}`
        );
      }
    });

    const averageConfidence = validatedMappings.length > 0
      ? totalConfidence / validatedMappings.length
      : 0;

    return {
      mappings: validatedMappings,
      summary: {
        totalItems: validatedMappings.length,
        categoryCounts,
        uniqueCategories,
        averageConfidence,
        warnings,
      },
      rawData: fileContent,
    };
  } catch (error) {
    console.error('Error processing price list upload:', error);
    throw new Error(
      `Failed to interpret price list: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Legacy function - delegates to processPriceListUpload.
 * Kept for backward compatibility with existing interpret-price-list route.
 */
export async function interpretPriceList(
  fileData: string
): Promise<InterpretationResult> {
  return processPriceListUpload(fileData, 'text');
}

/**
 * Normalize unit to Australian spelling
 */
function normalizeUnit(
  unit: string
): 'Metre' | 'Millimetre' | 'Square Metre' | 'Fixed' {
  const normalized = unit.toLowerCase().trim();

  if (normalized.includes('square') || normalized.includes('sqm') || normalized.includes('m²')) {
    return 'Square Metre';
  }

  if (normalized.includes('milli') || normalized === 'mm') {
    return 'Millimetre';
  }

  if (
    normalized === 'metre' ||
    normalized === 'meter' ||
    normalized === 'm' ||
    normalized.includes('linear')
  ) {
    return 'Metre';
  }

  return 'Fixed';
}

/**
 * Helper function to parse CSV content
 */
export function parseCSV(csvContent: string): string[][] {
  const lines = csvContent.split('\n').filter((line) => line.trim());
  return lines.map((line) =>
    line.split(',').map((cell) => cell.trim().replace(/^["']|["']$/g, ''))
  );
}

/**
 * Helper to format parsed data for AI consumption
 */
export function formatDataForAI(data: string[][]): string {
  if (data.length === 0) return '';

  const headers = data[0];
  const rows = data.slice(1);

  let formatted = 'Headers: ' + headers.join(' | ') + '\n\n';
  formatted += 'Rows:\n';

  rows.forEach((row, idx) => {
    formatted += `${idx + 1}. ${row.join(' | ')}\n`;
  });

  return formatted;
}
