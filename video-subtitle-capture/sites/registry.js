/**
 * SiteAdapterRegistry - Maps URL patterns to site adapters.
 * Decouples capture logic from site-specific implementations.
 */
class SiteAdapterRegistry {
  constructor() {
    this._adapters = [];
  }

  /**
   * Register a site adapter with a URL match pattern.
   * @param {string} urlPattern - Glob or regex string for host matching
   * @param {typeof BaseSiteAdapter} AdapterClass
   */
  register(urlPattern, AdapterClass) {
    this._adapters.push({ pattern: urlPattern, AdapterClass });
  }

  /**
   * Find the matching adapter for the current page URL.
   * @param {string} url - The page URL
   * @returns {BaseSiteAdapter|null}
   */
  getAdapter(url) {
    const host = new URL(url).hostname;
    for (const entry of this._adapters) {
      if (host.includes(entry.pattern.replace(/\*/g, ''))) {
        return new entry.AdapterClass();
      }
    }
    return null;
  }

  /**
   * Auto-register built-in adapters.
   */
  static createDefault() {
    const registry = new SiteAdapterRegistry();
    registry.register('bilibili.com', BilibiliSiteAdapter);
    return registry;
  }
}

if (typeof window !== 'undefined') {
  window.SiteAdapterRegistry = SiteAdapterRegistry;
}
