/**
 * URL building utilities for Entelequia web and storage resources.
 * 
 * Extracted from infrastructure layer to make them available to domain/application
 * without creating architecture violations.
 */

/**
 * Builds a product detail web URL from base URL and product slug.
 * @param webBaseUrl - Base URL (e.g., 'https://entelequia.com.ar')
 * @param slug - Product slug
 * @returns Full product URL
 */
export function productWebUrl(webBaseUrl: string, slug: string): string {
  return `${webBaseUrl}/producto/${encodeURIComponent(slug)}`;
}

/**
 * Builds a storage image URL from base URL and path.
 * @param webBaseUrl - Base URL (e.g., 'https://entelequia.com.ar')
 * @param path - Storage path (leading slash optional)
 * @returns Full image URL
 */
export function storageImageUrl(webBaseUrl: string, path: string): string {
  const normalizedPath = path.trim().replace(/^\//, '');
  return `${webBaseUrl}/storage/${normalizedPath}`;
}

/**
 * Picks the first available image URL from an images array.
 * @param images - Array of image objects with url or path properties
 * @param webBaseUrl - Base URL for storage images
 * @returns First image URL, or undefined if none available
 */
export function pickImageUrl(images: unknown, webBaseUrl: string): string | undefined {
  if (!Array.isArray(images) || images.length === 0) {
    return undefined;
  }

  const first = images[0];
  if (typeof first !== 'object' || first === null) {
    return undefined;
  }

  const record = first as Record<string, unknown>;

  if (typeof record.url === 'string' && record.url.trim().length > 0) {
    return record.url.trim();
  }

  if (typeof record.path === 'string' && record.path.trim().length > 0) {
    return storageImageUrl(webBaseUrl, record.path);
  }

  return undefined;
}
