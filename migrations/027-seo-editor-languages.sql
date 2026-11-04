-- Extend the editor's existing allowlist; preserve all saved copy and history.
ALTER TABLE seo_page_settings
  DROP CONSTRAINT chk_seo_settings_locale,
  ADD CONSTRAINT chk_seo_settings_locale CHECK (locale IN ('en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'hi', 'th'));

-- Roll back the application first. Keep the expanded allowlist to preserve
-- metadata already saved in the five added languages.
