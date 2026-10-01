import fs from 'fs';
import path from 'path';

/**
 * Clean stray duplicate files created by zip/sync software (e.g., activity_main-1.xml, MainActivity-1.java, etc.)
 */
function cleanDirectory(dirPath) {
  let count = 0;
  if (!fs.existsSync(dirPath)) return count;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.gradle') {
        continue;
      }
      count += cleanDirectory(fullPath);
    } else if (entry.isFile()) {
      // Detect stray duplicate patterns like file-1.ext, -1.gitignore, capacitor,build-1.gradle
      // Exclude legitimate asset names like pwa-192.png, pwa-512.png, icon-192.png
      const isAsset = entry.name.startsWith('pwa-') || entry.name.startsWith('icon-');
      const isDuplicate =
        !isAsset &&
        (/-\d{1,2}\.[a-zA-Z0-9]+$/.test(entry.name) ||
        /^-\d+\./.test(entry.name) ||
        /,\w+-1\./.test(entry.name) ||
        (entry.name.includes('-1.') && !entry.name.includes('caniuse')));

      if (isDuplicate) {
        console.log(`Removing duplicate file: ${fullPath}`);
        fs.unlinkSync(fullPath);
        count++;
      }
    }
  }

  return count;
}

const rootDir = process.cwd();
console.log('Cleaning stray duplicate (-1) files across project...');
const removedCount = cleanDirectory(rootDir);
console.log(`Finished cleanup. Removed ${removedCount} duplicate file(s).`);
