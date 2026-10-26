export type DocumentPreviewResult = 'opened' | 'invalid-url' | 'blocked' | 'error';

const getOrigin = (): string =>
  typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost';

export function getSafeDocumentUrl(value: string): string | null {
  const url = value.trim();
  if (!url || /[\u0000-\u001f\u007f]/.test(url)) return null;

  if (/^data:application\/pdf(?:;|,)/i.test(url) || /^data:image\/(?:png|jpeg|gif|webp|bmp|avif)(?:;|,)/i.test(url)) {
    return url;
  }

  try {
    const origin = getOrigin();
    if (/^[a-z][a-z\d+.-]*:/i.test(url)) {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
      if (parsed.protocol === 'blob:' && parsed.origin === origin) {
        return url;
      }
      return null;
    }

    if (url.startsWith('//')) return null;
    const parsed = new URL(url, origin);
    return parsed.origin === origin ? parsed.href : null;
  } catch {
    return null;
  }
}

export function openDocumentLink(value: string): boolean {
  const url = getSafeDocumentUrl(value);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

export function openDocumentPreview(
  value: string,
  title: string,
  options: {
    backgroundColor?: string;
    maxWidth?: string;
    maxHeight?: string;
    borderRadius?: string;
    boxShadow?: string;
  } = {},
): DocumentPreviewResult {
  const url = getSafeDocumentUrl(value);
  if (!url) return 'invalid-url';

  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) return 'blocked';

  try {
    popup.opener = null;
    popup.document.title = title;
    popup.document.body.style.margin = '0';
    popup.document.body.style.background = options.backgroundColor ?? '#0f172a';

    const parsedUrl = url.startsWith('data:') ? null : new URL(url);
    const isPdf =
      /^data:application\/pdf/i.test(url) ||
      Boolean(parsedUrl?.pathname.toLowerCase().endsWith('.pdf'));

    if (isPdf) {
      const iframe = popup.document.createElement('iframe');
      iframe.src = url;
      iframe.title = title;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.style.position = 'fixed';
      iframe.style.inset = '0';
      popup.document.body.appendChild(iframe);
    } else {
      const container = popup.document.createElement('div');
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'center';
      container.style.minHeight = '100vh';
      container.style.background = options.backgroundColor ?? '#0f172a';
      container.style.margin = '0';

      const image = popup.document.createElement('img');
      image.src = url;
      image.alt = title;
      image.style.maxWidth = options.maxWidth ?? '90%';
      image.style.maxHeight = options.maxHeight ?? '90vh';
      image.style.borderRadius = options.borderRadius ?? '8px';
      if (options.boxShadow) image.style.boxShadow = options.boxShadow;
      container.appendChild(image);
      popup.document.body.appendChild(container);
    }

    return 'opened';
  } catch (error) {
    popup.close();
    console.error('Unable to render document preview.', error);
    return 'error';
  }
}
