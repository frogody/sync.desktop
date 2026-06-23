/**
 * Region Capture
 *
 * Interactive drag-to-select screenshot using the macOS `screencapture -i`
 * utility (native crosshair). Returns the captured region as a PNG data URL,
 * or null if the user cancels (Esc) or capture fails.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

// Safety cap so a huge selection can't blow up the IPC payload / model request.
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export interface RegionCaptureResult {
  dataUrl: string;
  bytes: number;
}

export async function captureRegion(): Promise<RegionCaptureResult | null> {
  return new Promise((resolve) => {
    try {
      if (process.platform !== 'darwin') {
        console.warn('[regionCapture] Only supported on macOS');
        resolve(null);
        return;
      }

      const dir = path.join(app.getPath('temp'), 'sync-desktop-captures');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const outPath = path.join(dir, `region_${Date.now()}.png`);

      let settled = false;
      const finish = (result: RegionCaptureResult | null) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      // -i interactive drag-select, -x no sound, -t png
      const proc = spawn('screencapture', ['-i', '-x', '-t', 'png', outPath]);

      proc.on('error', (err) => {
        console.error('[regionCapture] spawn error:', err);
        finish(null);
      });

      proc.on('close', () => {
        try {
          if (!fs.existsSync(outPath)) {
            // User pressed Esc / cancelled — no file written
            finish(null);
            return;
          }
          const buf = fs.readFileSync(outPath);
          fs.unlink(outPath, () => {});
          if (buf.length === 0) {
            finish(null);
            return;
          }
          if (buf.length > MAX_BYTES) {
            console.warn('[regionCapture] Capture too large:', buf.length);
            finish(null);
            return;
          }
          finish({ dataUrl: `data:image/png;base64,${buf.toString('base64')}`, bytes: buf.length });
        } catch (e) {
          console.error('[regionCapture] read error:', e);
          finish(null);
        }
      });

      // Safety timeout — if the user walks away mid-selection (2 min)
      setTimeout(() => {
        try { proc.kill(); } catch { /* ignore */ }
        finish(null);
      }, 120_000);
    } catch (e) {
      console.error('[regionCapture] error:', e);
      resolve(null);
    }
  });
}
