-- Rename column from signer_user_id to user_id
ALTER TABLE "quote_signatures" 
  RENAME COLUMN "signer_user_id" TO "user_id";

-- Rename column from signature_method to signature_type
ALTER TABLE "quote_signatures" 
  RENAME COLUMN "signature_method" TO "signature_type";
