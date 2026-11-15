-- Public directory by name for the client area (ADR-028). Additive: two functions, no table,
-- no data change. Only published and active clinics can be found, by the same public name the
-- showcase already shows; the runtime role receives the search wrapper only.

-- Same accent folding as luminix.slugify (the unaccent extension is not assumed), but words
-- stay separated by one space and the text is not truncated.
CREATE FUNCTION luminix.fold_search_text(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT btrim(regexp_replace(
    translate(lower(coalesce(p_text, '')),
      'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
      'aaaaaaeeeeiiiiooooouuuucnyy'),
    '[^a-z0-9]+', ' ', 'g'))
$$;
REVOKE ALL ON FUNCTION luminix.fold_search_text(text) FROM PUBLIC;

-- Up to 8 current addresses whose public name contains the term (3+ folded characters), names
-- starting with the term first. A full space code (AA-0000) also matches its own clinic. The
-- folded term has only [a-z0-9 ], so it carries no LIKE wildcard.
CREATE FUNCTION luminix.search_public_clinics(p_query text)
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH term AS (SELECT luminix.fold_search_text(left(p_query, 120)) AS value),
  published AS (
    SELECT c.slug, c.share_code,
      luminix.fold_search_text(coalesce(nullif(btrim(p.public_showcase->>'title'), ''), c.name)) AS name
    FROM luminix.clinics c
    JOIN luminix.clinic_profiles p ON p.clinic_id = c.id AND p.public_enabled
    WHERE c.status = 'active'
  )
  SELECT d.slug FROM published d, term t
  WHERE length(t.value) >= 3
    AND (d.name LIKE '%' || t.value || '%' OR luminix.fold_search_text(d.share_code) = t.value)
  ORDER BY d.name NOT LIKE t.value || '%', d.name, d.slug
  LIMIT 8
$$;
REVOKE ALL ON FUNCTION luminix.search_public_clinics(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.search_public_clinics(text) TO luminix_api;
