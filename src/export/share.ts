/**
 * Offers a file through the iOS/Android share sheet (Files, AirDrop, Mail…) when the browser
 * supports sharing files, otherwise downloads it.
 */
export async function shareOrDownload(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // user closed the sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Renders a graph canvas onto a titled image with readout lines, for PNG export. */
export function composeImage(source: HTMLCanvasElement, title: string, lines: string[]): HTMLCanvasElement {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  const scale = source.width / source.getBoundingClientRect().width || 2;
  const pad = 16 * scale;
  const headH = (34 + lines.length * 18) * scale;
  const out = document.createElement('canvas');
  out.width = source.width + pad * 2;
  out.height = source.height + headH + pad;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = v('--bg');
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = v('--text');
  ctx.font = `600 ${16 * scale}px ${v('--font-ui')}`;
  ctx.fillText(title, pad, pad + 14 * scale);
  ctx.fillStyle = v('--text-dim');
  ctx.font = `${12 * scale}px ${v('--font-num')}`;
  lines.forEach((l, i) => ctx.fillText(l, pad, pad + (36 + i * 18) * scale));
  ctx.drawImage(source, pad, headH);
  return out;
}

export function thumbnail(source: HTMLCanvasElement, width = 240): string {
  const c = document.createElement('canvas');
  const r = source.height / source.width || 0.5;
  c.width = width;
  c.height = Math.round(width * r);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

export const canvasBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'));
