// src/lib/html-parser.ts
// Server-side HTML extraction utilities using regex — no extra dependencies needed.

export function extractTitle(html: string): string {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
}

export function extractMeta(html: string, name: string): string {
  // Matches both name= and property= (for og:title etc.), in either attribute order
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']` +
    `|<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`,
    "i"
  );
  const m = html.match(pattern);
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

export function extractCanonical(html: string): string {
  return html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)?.[1] ?? "";
}

export function extractHeadings(html: string, limit = 20): { level: number; text: string }[] {
  const results: { level: number; text: string }[] = [];
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && results.length < limit) {
    const text = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (text) results.push({ level: parseInt(m[1]), text });
  }
  return results;
}

export function extractJsonLd(html: string, limit = 3): unknown[] {
  const results: unknown[] = [];
  // Handles: quoted/unquoted type attribute, attribute in any order, extra whitespace
  const re = /<script[^>]+type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && results.length < limit) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const str = JSON.stringify(parsed);
      if (str.length > 800) {
        const typeHint = (parsed as Record<string, unknown>)?.["@type"] ?? "unknown";
        results.push({ "@type": typeHint, _truncated: true, _preview: str.slice(0, 800) });
      } else {
        results.push(parsed);
      }
    } catch { /* skip malformed */ }
  }
  return results;
}

export function extractWordCount(html: string): number {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, "");
  return text.split(/\s+/).filter(Boolean).length;
}

export function extractLinks(
  html: string,
  domain: string,
  limits = { internal: 30, external: 10 }
): { internalLinks: string[]; externalLinks: string[] } {
  const internalLinks: string[] = [];
  const externalLinks: string[] = [];
  const seen = new Set<string>();
  const re = /href=["'](https?:\/\/[^"'#?\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    if (url.includes(domain)) {
      if (internalLinks.length < limits.internal) internalLinks.push(url);
    } else {
      if (externalLinks.length < limits.external) externalLinks.push(url);
    }
  }
  return { internalLinks, externalLinks };
}

/** Compact page summary for the content agent (text fallback when no screenshots available) */
export function extractContentSummary(html: string, url: string) {
  let domain = "";
  try { domain = new URL(url).hostname; } catch { /* keep empty */ }
  return {
    url,
    title: extractTitle(html),
    metaDescription: extractMeta(html, "description"),
    headings: extractHeadings(html, 10),
    wordCount: extractWordCount(html),
    externalLinksCount: extractLinks(html, domain).externalLinks.length,
  };
}

/** Compact page summary for the technical agent */
export function extractTechnicalSummary(html: string, url: string) {
  let domain = "";
  try { domain = new URL(url).hostname; } catch { /* keep empty */ }
  const links = extractLinks(html, domain);
  return {
    url,
    title: extractTitle(html),
    metaDescription: extractMeta(html, "description"),
    metaRobots: extractMeta(html, "robots"),
    canonical: extractCanonical(html),
    headings: extractHeadings(html, 10),
    wordCount: extractWordCount(html),
    hasHttps: url.startsWith("https://"),
    internalLinksCount: links.internalLinks.length,
    externalLinksCount: links.externalLinks.length,
  };
}

/** Compact page summary for the schema agent (JSON-LD extraction) */
export function extractSchemaSummary(html: string, url: string) {
  return {
    url,
    title: extractTitle(html),
    schemaMarkup: extractJsonLd(html, 3),
  };
}

/**
 * Full schema markup extraction for the schema agent.
 * Extracts ALL JSON-LD blocks (uncapped, up to 1500 chars each), plus
 * detects microdata and RDFa presence directly from the raw HTML.
 */
export function extractAllSchemaMarkup(html: string, url: string): {
  url: string;
  jsonLd: unknown[];
  hasMicrodata: boolean;
  hasRdfa: boolean;
} {
  const jsonLd: unknown[] = [];
  const re = /<script[^>]+type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const str = JSON.stringify(parsed);
      if (str.length > 1500) {
        const typeHint = (parsed as Record<string, unknown>)?.["@type"] ?? "unknown";
        jsonLd.push({ "@type": typeHint, _truncated: true, _preview: str.slice(0, 1500) });
      } else {
        jsonLd.push(parsed);
      }
    } catch { /* skip malformed JSON-LD */ }
  }

  return {
    url,
    jsonLd,
    hasMicrodata: /itemscope|itemtype=/i.test(html),
    hasRdfa: /\btypeof=|\bvocab=|\bproperty=/i.test(html),
  };
}
