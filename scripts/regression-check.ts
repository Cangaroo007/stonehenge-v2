/**
 * Regression harness for the V2 pricing calculator.
 *
 * Reads fixture JSON files, looks up each quote in the live database by
 * quoteNumber or quoteId, runs calculateQuotePrice, then compares the
 * calculator's totalIncGst (and optional line items) to what Northcoast
 * actually quoted. Emits a delta report.
 *
 * Read-only against the database. No DB writes, no fixture seeding.
 *
 * Run:
 *   npx tsx scripts/regression-check.ts                       (default glob)
 *   npx tsx scripts/regression-check.ts 'scripts/fixtures/*.json'
 *
 * Exit code: 0 if all PASS, 1 if any FAIL or error.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import prisma from '../src/lib/db';
import { calculateQuotePrice } from '../src/lib/services/pricing-calculator-v2';
import type { RegressionFixture, DeltaReportRow } from './fixtures/_schema';

const DEFAULT_GLOB = 'scripts/fixtures/*.json';
const REPORT_JSON = 'scripts/fixtures/_GAP-REPORT.json';
const REPORT_MD = 'scripts/fixtures/_GAP-REPORT.md';

const DEFAULT_TOLERANCE_ABS = 1.0;
const DEFAULT_TOLERANCE_PCT = 0.005;

// ---------- glob (minimal — handles `dir/*.ext` and exact paths) ----------

async function findFixtures(pattern: string): Promise<string[]> {
  if (!pattern.includes('*') && !pattern.includes('?')) {
    // Treat as a single file path.
    try {
      await fs.stat(pattern);
      return [pattern];
    } catch {
      return [];
    }
  }
  const lastSlash = pattern.lastIndexOf('/');
  const dir = lastSlash >= 0 ? pattern.slice(0, lastSlash) : '.';
  const filePattern = lastSlash >= 0 ? pattern.slice(lastSlash + 1) : pattern;
  const regex = new RegExp(
    '^' + filePattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
  );
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  return entries
    .filter(f => regex.test(f))
    .filter(f => !f.startsWith('_'))   // skip _schema.ts, _GAP-REPORT.*
    .filter(f => !f.endsWith('.ts'))   // fixtures are JSON only
    .map(f => path.join(dir, f))
    .sort();
}

// ---------- type guard ----------

function isRegressionFixture(v: unknown): v is RegressionFixture {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;

  const meta = o.meta as Record<string, unknown> | undefined;
  if (!meta || typeof meta !== 'object') return false;
  if (typeof meta.fixtureId !== 'string') return false;
  if (typeof meta.sourceQuoteNumber !== 'string') return false;
  if (typeof meta.customerName !== 'string') return false;
  if (typeof meta.corpusPath !== 'string') return false;

  const target = o.target as Record<string, unknown> | undefined;
  if (!target || typeof target !== 'object') return false;
  const hasNumber = typeof target.quoteNumber === 'string';
  const hasId = typeof target.quoteId === 'number';
  if (hasNumber === hasId) return false;  // exactly one required

  const expected = o.expected as Record<string, unknown> | undefined;
  if (!expected || typeof expected !== 'object') return false;
  // baseSubtotal and rulesDiscount may be null when the NCS PDF omits them
  if (!(typeof expected.baseSubtotal === 'number' || expected.baseSubtotal === null)) return false;
  if (!(typeof expected.rulesDiscount === 'number' || expected.rulesDiscount === null)) return false;
  if (typeof expected.subtotalAfterRules !== 'number') return false;
  if (typeof expected.gstAmount !== 'number') return false;
  if (typeof expected.totalIncGst !== 'number') return false;

  return true;
}

// ---------- quote resolution ----------

async function resolveQuoteId(target: RegressionFixture['target']): Promise<number | null> {
  if (typeof target.quoteId === 'number') {
    const q = await prisma.quotes.findUnique({
      where: { id: target.quoteId },
      select: { id: true },
    });
    return q?.id ?? null;
  }
  if (typeof target.quoteNumber === 'string') {
    const q = await prisma.quotes.findFirst({
      where: { quote_number: target.quoteNumber },
      select: { id: true },
    });
    return q?.id ?? null;
  }
  return null;
}

// ---------- delta math ----------

function computeTolerance(ncsTotal: number, t?: { absoluteDollars?: number; percentOfTotal?: number }): number {
  const abs = t?.absoluteDollars ?? DEFAULT_TOLERANCE_ABS;
  const pct = t?.percentOfTotal ?? DEFAULT_TOLERANCE_PCT;
  return Math.max(abs, Math.abs(ncsTotal) * pct);
}

function buildLineItemDeltas(
  expected: RegressionFixture['expected'],
  result: Awaited<ReturnType<typeof calculateQuotePrice>>
): Record<string, { ncs: number; v2: number; delta: number }> | undefined {
  const out: Record<string, { ncs: number; v2: number; delta: number }> = {};
  let any = false;

  if (expected.materials?.total !== undefined) {
    const v2 = result.breakdown.materials?.total ?? 0;
    out.materials = { ncs: expected.materials.total, v2, delta: v2 - expected.materials.total };
    any = true;
  }
  if (expected.edges?.total !== undefined) {
    const v2 = result.breakdown.edges?.total ?? 0;
    out.edges = { ncs: expected.edges.total, v2, delta: v2 - expected.edges.total };
    any = true;
  }
  if (expected.cutouts?.total !== undefined) {
    const v2 = result.breakdown.cutouts?.total ?? 0;
    out.cutouts = { ncs: expected.cutouts.total, v2, delta: v2 - expected.cutouts.total };
    any = true;
  }
  if (expected.delivery?.finalCost !== undefined) {
    const v2 = result.breakdown.delivery?.finalCost ?? 0;
    out.delivery = { ncs: expected.delivery.finalCost, v2, delta: v2 - expected.delivery.finalCost };
    any = true;
  }
  if (expected.services && expected.services.length > 0) {
    const v2Items = result.breakdown.services?.items ?? [];
    for (const expSvc of expected.services) {
      const v2Item = v2Items.find(i => i.serviceType === expSvc.serviceType);
      const v2 = v2Item?.subtotal ?? 0;
      out[`service:${expSvc.serviceType}`] = {
        ncs: expSvc.subtotal,
        v2,
        delta: v2 - expSvc.subtotal,
      };
      any = true;
    }
  }

  return any ? out : undefined;
}

// ---------- implied-breakdown deltas (informational) ----------

function buildImpliedComponentDeltas(
  expected: RegressionFixture['expected'],
  result: Awaited<ReturnType<typeof calculateQuotePrice>>
): DeltaReportRow['impliedComponentDeltas'] {
  const ib = expected.ncsImpliedBreakdown;
  if (!ib) return undefined;

  const rows: NonNullable<DeltaReportRow['impliedComponentDeltas']> = [];

  function push(component: string, ncs: number, v2: number | null, prov: string) {
    const delta = v2 === null ? null : v2 - ncs;
    rows.push({ component, ncsImplied: ncs, v2, delta, rateProvenance: prov });
  }

  function findService(t: string): number | null {
    const items = result.breakdown.services?.items ?? [];
    const m = items.find(i => i.serviceType === t);
    return m ? m.subtotal : null;
  }

  if (ib.materials) {
    push('materials', ib.materials.total, result.breakdown.materials?.total ?? null, ib.materials.rateProvenance);
  }
  if (ib.cutting) {
    push('cutting', ib.cutting.total, findService('CUTTING'), ib.cutting.rateProvenance);
  }
  if (ib.polishing) {
    push('polishing', ib.polishing.total, findService('POLISHING'), ib.polishing.rateProvenance);
  }
  if (ib.cutouts) {
    push('cutouts', ib.cutouts.total, result.breakdown.cutouts?.total ?? null, ib.cutouts.rateProvenance);
  }
  if (ib.installation) {
    push('installation', ib.installation.total, findService('INSTALLATION'), ib.installation.rateProvenance);
  }
  if (ib.templating) {
    push('templating', ib.templating.total, result.breakdown.templating?.finalCost ?? null, ib.templating.rateProvenance);
  }
  if (ib.delivery) {
    push('delivery', ib.delivery.total, result.breakdown.delivery?.finalCost ?? null, ib.delivery.rateProvenance);
  }

  return rows.length > 0 ? rows : undefined;
}

// ---------- runner ----------

async function runFixture(fixturePath: string): Promise<DeltaReportRow> {
  const errors: string[] = [];
  const baseRow: DeltaReportRow = {
    fixtureId: '<unparsed>',
    sourceQuoteNumber: '<unparsed>',
    ncsTotalIncGst: 0,
    v2TotalIncGst: 0,
    deltaDollars: 0,
    deltaPercent: 0,
    withinTolerance: false,
    ncsBaseSubtotal: null,
    ncsRulesDiscount: null,
    ncsSubtotalAfterRules: 0,
    v2BaseSubtotal: 0,
    v2RulesDiscount: 0,
    v2SubtotalAfterRules: 0,
    errors,
  };

  let raw: unknown;
  try {
    const text = await fs.readFile(fixturePath, 'utf8');
    raw = JSON.parse(text);
  } catch (e) {
    errors.push(`Failed to read or parse ${fixturePath}: ${(e as Error).message}`);
    return baseRow;
  }

  if (!isRegressionFixture(raw)) {
    errors.push(`Fixture ${fixturePath} does not satisfy RegressionFixture schema`);
    return baseRow;
  }
  const fixture = raw;

  baseRow.fixtureId = fixture.meta.fixtureId;
  baseRow.sourceQuoteNumber = fixture.meta.sourceQuoteNumber;
  baseRow.ncsTotalIncGst = fixture.expected.totalIncGst;
  baseRow.ncsBaseSubtotal = fixture.expected.baseSubtotal;
  baseRow.ncsRulesDiscount = fixture.expected.rulesDiscount;
  baseRow.ncsSubtotalAfterRules = fixture.expected.subtotalAfterRules;

  // Reconciliation check on the EXPECTED (NCS) side.
  // PASS/FAIL is decided on totalIncGst; this only emits a warning.
  if (fixture.expected.baseSubtotal !== null && fixture.expected.rulesDiscount !== null) {
    const reconciled =
      fixture.expected.baseSubtotal -
      fixture.expected.rulesDiscount +
      fixture.expected.gstAmount;
    if (Math.abs(reconciled - fixture.expected.totalIncGst) >= 0.05) {
      errors.push(
        `EXPECTED reconciliation failed: base($${fixture.expected.baseSubtotal.toFixed(2)}) - rules($${fixture.expected.rulesDiscount.toFixed(2)}) + gst($${fixture.expected.gstAmount.toFixed(2)}) ≠ total($${fixture.expected.totalIncGst.toFixed(2)}). Source PDF likely cuts corners — verify.`
      );
    }
  }

  const quoteId = await resolveQuoteId(fixture.target);
  if (quoteId === null) {
    const ref = fixture.target.quoteNumber ?? `id ${fixture.target.quoteId}`;
    errors.push(`Quote ${ref} not found in database`);
    return baseRow;
  }

  let result: Awaited<ReturnType<typeof calculateQuotePrice>>;
  try {
    result = await calculateQuotePrice(String(quoteId));
  } catch (e) {
    errors.push(`calculateQuotePrice failed: ${(e as Error).message}`);
    return baseRow;
  }

  const v2Total = result.totalIncGst;
  const ncsTotal = fixture.expected.totalIncGst;
  const delta = v2Total - ncsTotal;
  const pct = ncsTotal === 0 ? 0 : delta / ncsTotal;
  const tolerance = computeTolerance(ncsTotal, fixture.expected.tolerance);
  const within = Math.abs(delta) <= tolerance;

  baseRow.v2TotalIncGst = v2Total;
  baseRow.deltaDollars = delta;
  baseRow.deltaPercent = pct;
  baseRow.withinTolerance = within;
  baseRow.v2BaseSubtotal = result.baseSubtotal ?? result.subtotal;
  baseRow.v2RulesDiscount = result.rulesDiscount ?? 0;
  baseRow.v2SubtotalAfterRules = result.rulesAdjustedSubtotal ?? result.subtotal;
  baseRow.lineItemDeltas = buildLineItemDeltas(fixture.expected, result);
  baseRow.impliedComponentDeltas = buildImpliedComponentDeltas(fixture.expected, result);

  return baseRow;
}

function fmtMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function printConsoleLine(row: DeltaReportRow): void {
  const status = row.errors.length > 0 ? 'ERROR' : row.withinTolerance ? 'PASS' : 'FAIL';
  if (row.errors.length > 0) {
    console.log(`[${status}] ${row.fixtureId}  ${row.errors.join('; ')}`);
    return;
  }
  console.log(
    `[${status}] ${row.fixtureId}  V2=${fmtMoney(row.v2TotalIncGst)}  NCS=${fmtMoney(row.ncsTotalIncGst)}  Δ=${fmtMoney(row.deltaDollars)} (${fmtPct(row.deltaPercent)})`
  );
}

function buildMarkdownReport(rows: DeltaReportRow[]): string {
  const sorted = [...rows].sort((a, b) => Math.abs(b.deltaDollars) - Math.abs(a.deltaDollars));
  const lines: string[] = [];
  lines.push('# V2 Pricing Calculator — Regression Gap Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Fixtures run: ${rows.length}`);
  const passes = rows.filter(r => r.errors.length === 0 && r.withinTolerance).length;
  const fails = rows.filter(r => r.errors.length === 0 && !r.withinTolerance).length;
  const errs = rows.filter(r => r.errors.length > 0).length;
  lines.push(`PASS: ${passes} · FAIL: ${fails} · ERROR: ${errs}`);
  lines.push('');
  lines.push('| Status | Fixture | NCS Quote | V2 Total | NCS Total | Δ ($) | Δ (%) | Notes |');
  lines.push('|---|---|---|---:|---:|---:|---:|---|');
  for (const r of sorted) {
    const status = r.errors.length > 0 ? 'ERROR' : r.withinTolerance ? 'PASS' : 'FAIL';
    const notes = r.errors.length > 0 ? r.errors.join('; ').replace(/\|/g, '\\|') : '';
    lines.push(
      `| ${status} | ${r.fixtureId} | ${r.sourceQuoteNumber} | ${fmtMoney(r.v2TotalIncGst)} | ${fmtMoney(r.ncsTotalIncGst)} | ${fmtMoney(r.deltaDollars)} | ${fmtPct(r.deltaPercent)} | ${notes} |`
    );
  }

  // Implied component deltas — informational, not gated.
  const implied: Array<{ fixtureId: string; row: NonNullable<DeltaReportRow['impliedComponentDeltas']>[number] }> = [];
  for (const r of rows) {
    if (!r.impliedComponentDeltas) continue;
    for (const c of r.impliedComponentDeltas) {
      implied.push({ fixtureId: r.fixtureId, row: c });
    }
  }
  if (implied.length > 0) {
    implied.sort((a, b) => {
      const f = a.fixtureId.localeCompare(b.fixtureId);
      if (f !== 0) return f;
      return a.row.component.localeCompare(b.row.component);
    });
    lines.push('');
    lines.push('## Implied component deltas');
    lines.push('');
    lines.push('Informational only — derived from Beau\'s rate sheet + Alpha Surfaces catalog + V2 zone constants. NOT gated on PASS/FAIL.');
    lines.push('');
    lines.push('| Fixture | Component | NCS-implied $ | V2 $ | Δ $ | Provenance |');
    lines.push('|---|---|---:|---:|---:|---|');
    for (const { fixtureId, row } of implied) {
      const v2 = row.v2 === null ? '—' : fmtMoney(row.v2);
      const d = row.delta === null ? '—' : fmtMoney(row.delta);
      const prov = row.rateProvenance.replace(/\|/g, '\\|');
      lines.push(
        `| ${fixtureId} | ${row.component} | ${fmtMoney(row.ncsImplied)} | ${v2} | ${d} | ${prov} |`
      );
    }
  }

  return lines.join('\n') + '\n';
}

async function main(): Promise<number> {
  const pattern = process.argv[2] ?? DEFAULT_GLOB;
  const fixturePaths = await findFixtures(pattern);

  if (fixturePaths.length === 0) {
    console.error(`No fixture files matched: ${pattern}`);
    return 1;
  }

  const rows: DeltaReportRow[] = [];
  for (const fp of fixturePaths) {
    const row = await runFixture(fp);
    rows.push(row);
    printConsoleLine(row);
  }

  await fs.writeFile(REPORT_JSON, JSON.stringify(rows, null, 2) + '\n', 'utf8');
  await fs.writeFile(REPORT_MD, buildMarkdownReport(rows), 'utf8');

  const anyFail = rows.some(r => r.errors.length > 0 || !r.withinTolerance);
  return anyFail ? 1 : 0;
}

main()
  .then(async code => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async err => {
    console.error('Fatal error:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
