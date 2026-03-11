-- CURVE-2a: Add corner edge columns for ROUNDED_RECT pieces
-- Uses IF NOT EXISTS because columns may have been added manually before this migration
ALTER TABLE "quote_pieces"
  ADD COLUMN IF NOT EXISTS "corner_edge_tl" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "corner_edge_tr" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "corner_edge_bl" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "corner_edge_br" VARCHAR(255);
