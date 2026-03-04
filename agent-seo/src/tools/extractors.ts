// src/tools/extractors.ts
export const PAGE_DATA_SCRIPT = `
(() => {
  const getMeta = (name) => document.querySelector(\`meta[name="\${name}"], meta[property="\${name}"]\`)?.content ?? "";
  const getLinks = () => Array.from(document.querySelectorAll("a[href]")).map(a => a.href).filter(h => h.startsWith("http"));
  const domain = window.location.hostname;
  const allLinks = getLinks();
  return {
    url: window.location.href,
    title: document.title,
    metaDescription: getMeta("description"),
    metaRobots: getMeta("robots"),
    canonical: document.querySelector("link[rel='canonical']")?.href ?? "",
    headings: Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).slice(0, 50).map(h => ({ level: parseInt(h.tagName[1]), text: h.textContent?.trim() ?? "" })),
    schemaMarkup: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 5).map(s => { try { return JSON.parse(s.textContent ?? "{}"); } catch { return null; } }).filter(Boolean),
    images: Array.from(document.querySelectorAll("img")).slice(0, 30).map(img => ({ src: img.src, alt: img.alt, hasLazyLoad: img.loading === "lazy" })),
    internalLinks: allLinks.filter(h => h.includes(domain)).slice(0, 60),
    externalLinks: allLinks.filter(h => !h.includes(domain)).slice(0, 20),
    wordCount: document.body?.innerText?.split(/\\s+/).filter(Boolean).length ?? 0,
    hasHttps: window.location.protocol === "https:",
    ogTitle: getMeta("og:title"),
    ogDescription: getMeta("og:description"),
    twitterCard: getMeta("twitter:card"),
    viewport: getMeta("viewport"),
  };
})()
`;

export const PERFORMANCE_SCRIPT = `
(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  return {
    responseTime: nav ? nav.responseEnd - nav.requestStart : 0,
    domLoadTime: nav ? nav.domContentLoadedEventEnd - nav.navigationStart : 0,
    fullLoadTime: nav ? nav.loadEventEnd - nav.navigationStart : 0,
  };
})()
`;
