-- `sex` is the BIOLOGICAL sex (relevant to waxing and intimate treatments), not gender identity.
-- Only 'female' and 'male' are valid; NULL means "not informed" (quick registrations).
-- Fails without changing anything if a row still holds a value removed from the domain.

ALTER TABLE luminix.clinic_clients DROP CONSTRAINT clinic_clients_sex_check;
ALTER TABLE luminix.clinic_clients
  ADD CONSTRAINT clinic_clients_sex_check CHECK (sex IS NULL OR sex IN ('female', 'male'));

COMMENT ON COLUMN luminix.clinic_clients.sex IS
  'Biological sex: female | male. NULL = not informed. Not gender identity.';
