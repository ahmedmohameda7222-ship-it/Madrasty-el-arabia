-- Cash is the school's primary payment channel; bank receipts remain supported.
ALTER TABLE app.receipt_configuration ALTER COLUMN cash_enabled SET DEFAULT true;
UPDATE app.receipt_configuration SET cash_enabled=true WHERE singleton;
