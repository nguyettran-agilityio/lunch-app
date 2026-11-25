-- `email` and `pending_email` of profiles are unique across both columns (docs/plan.md
-- section 2, CN-65): each column has its own unique constraint (0000_init.sql), and
-- this trigger refuses an address that another row holds in the other column (B37).
-- The advisory lock makes two writes at the same time run one after the other, so both
-- cannot pass the check; it is held until the transaction ends.
CREATE FUNCTION public.profiles_email_cross_unique() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('profiles_email_cross_unique'));
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id <> NEW.id
      AND (p.pending_email = NEW.email OR (NEW.pending_email IS NOT NULL AND p.email = NEW.pending_email))
  ) THEN
    RAISE EXCEPTION 'email already held by another profile'
      USING ERRCODE = 'unique_violation', CONSTRAINT = 'profiles_email_cross_unique';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER profiles_email_cross_unique
BEFORE INSERT OR UPDATE OF email, pending_email ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_email_cross_unique();
