import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

try {
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const binary = require('ffmpeg-static');
  if (!binary || !fs.existsSync(binary)) process.exit(0);
  const destDir = path.join(process.cwd(), 'vendor');
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  fs.copyFileSync(binary, dest);
  fs.chmodSync(dest, 0o755);
} catch {
  process.exit(0);
}
