const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const config = require('../config/app.config');

/**
 * Normalize and verify that a target path strictly resides within the website root directory
 * Protects against directory traversal attacks (e.g. ../../etc/passwd)
 */
function resolveSafePath(websiteRoot, relativeSubPath = '') {
  const normalizedRoot = path.resolve(websiteRoot);
  const normalizedTarget = path.resolve(normalizedRoot, relativeSubPath.replace(/^[/\\]+/, ''));

  // Target must start with the root directory path + separator (or be the root itself)
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(normalizedRoot + path.sep)) {
    throw new Error('Access Denied: Path traversal detected');
  }

  return {
    root: normalizedRoot,
    target: normalizedTarget,
    relative: path.relative(normalizedRoot, normalizedTarget).replace(/\\/g, '/')
  };
}

/**
 * List files and directories at a specific relative path
 */
async function listFiles(websiteRoot, relativeSubPath = '') {
  const { target, relative } = resolveSafePath(websiteRoot, relativeSubPath);

  if (!fs.existsSync(target)) {
    throw new Error('Directory does not exist');
  }

  const stat = await fs.promises.stat(target);
  if (!stat.isDirectory()) {
    throw new Error('Path is not a directory');
  }

  const entries = await fs.promises.readdir(target, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    const fullItemPath = path.join(target, entry.name);
    try {
      const itemStat = await fs.promises.stat(fullItemPath);
      const isZip = !entry.isDirectory() && entry.name.toLowerCase().endsWith('.zip');
      items.push({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isZip,
        size: entry.isDirectory() ? null : itemStat.size,
        modifiedAt: itemStat.mtime.toISOString(),
        relativePath: path.join(relative, entry.name).replace(/\\/g, '/')
      });
    } catch (e) {
      // Ignore broken symlinks / unreadable items
    }
  }

  // Sort directories first, then alphabetical
  items.sort((a, b) => {
    if (a.isDirectory === b.isDirectory) {
      return a.name.localeCompare(b.name);
    }
    return a.isDirectory ? -1 : 1;
  });

  return {
    currentPath: relative || '/',
    items
  };
}

/**
 * Read text file contents
 */
async function readFile(websiteRoot, relativeSubPath) {
  const { target } = resolveSafePath(websiteRoot, relativeSubPath);

  if (!fs.existsSync(target)) {
    throw new Error('File not found');
  }

  const stat = await fs.promises.stat(target);
  if (stat.isDirectory()) {
    throw new Error('Target is a directory, not a file');
  }

  // Max 5MB file reading in browser editor
  if (stat.size > 5 * 1024 * 1024) {
    throw new Error('File too large to open in web editor (max 5MB)');
  }

  const content = await fs.promises.readFile(target, 'utf8');
  return {
    content,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString()
  };
}

/**
 * Write / save file contents
 */
async function writeFile(websiteRoot, relativeSubPath, content) {
  const { target } = resolveSafePath(websiteRoot, relativeSubPath);
  const parentDir = path.dirname(target);

  if (!fs.existsSync(parentDir)) {
    await fs.promises.mkdir(parentDir, { recursive: true });
  }

  await fs.promises.writeFile(target, content, 'utf8');
  return { success: true };
}

/**
 * Create a new folder
 */
async function createDirectory(websiteRoot, relativeSubPath) {
  const { target } = resolveSafePath(websiteRoot, relativeSubPath);

  if (fs.existsSync(target)) {
    throw new Error('Directory already exists');
  }

  await fs.promises.mkdir(target, { recursive: true });
  return { success: true };
}

/**
 * Delete a file or directory recursively
 */
async function deleteItem(websiteRoot, relativeSubPath) {
  const { root, target } = resolveSafePath(websiteRoot, relativeSubPath);

  // Never allow deleting the website root directory itself via file manager
  if (target === root) {
    throw new Error('Cannot delete website root directory');
  }

  if (!fs.existsSync(target)) {
    throw new Error('Target item does not exist');
  }

  await fs.promises.rm(target, { recursive: true, force: true });
  return { success: true };
}

/**
 * Delete multiple items
 */
async function deleteMultipleItems(websiteRoot, relativePaths = []) {
  const results = [];
  for (const relPath of relativePaths) {
    try {
      await deleteItem(websiteRoot, relPath);
      results.push({ path: relPath, success: true });
    } catch (err) {
      results.push({ path: relPath, success: false, error: err.message });
    }
  }
  return { success: true, results };
}

/**
 * Rename or move an item
 */
async function renameItem(websiteRoot, oldRelativePath, newRelativePath) {
  const oldSafe = resolveSafePath(websiteRoot, oldRelativePath);
  const newSafe = resolveSafePath(websiteRoot, newRelativePath);

  if (oldSafe.target === oldSafe.root) {
    throw new Error('Cannot rename website root directory');
  }

  if (!fs.existsSync(oldSafe.target)) {
    throw new Error('Source file does not exist');
  }

  if (fs.existsSync(newSafe.target)) {
    throw new Error('Destination already exists');
  }

  const destParent = path.dirname(newSafe.target);
  if (!fs.existsSync(destParent)) {
    await fs.promises.mkdir(destParent, { recursive: true });
  }

  await fs.promises.rename(oldSafe.target, newSafe.target);
  return { success: true };
}

/**
 * Extract a ZIP archive with directory traversal security guards (Zip-Slip protection)
 */
async function extractZipArchive(websiteRoot, zipRelativePath, targetSubPath = '') {
  const { target: zipFullPath } = resolveSafePath(websiteRoot, zipRelativePath);
  const { target: extractDestPath } = resolveSafePath(websiteRoot, targetSubPath);

  if (!fs.existsSync(zipFullPath)) {
    throw new Error('Zip archive not found');
  }

  const zip = new AdmZip(zipFullPath);
  const zipEntries = zip.getEntries();

  // Validate all entry paths to prevent zip slip attacks
  for (const entry of zipEntries) {
    const entryTargetPath = path.normalize(path.join(extractDestPath, entry.entryName));
    if (entryTargetPath !== extractDestPath && !entryTargetPath.startsWith(extractDestPath + path.sep)) {
      throw new Error(`Security Exception: Path traversal zip entry detected (${entry.entryName})`);
    }
  }

  // Ensure destination directory exists
  if (!fs.existsSync(extractDestPath)) {
    await fs.promises.mkdir(extractDestPath, { recursive: true });
  }

  // Extract all entries safely
  zip.extractAllTo(extractDestPath, true);

  return {
    success: true,
    extractedCount: zipEntries.length,
    destination: targetSubPath || '/'
  };
}

/**
 * Compress selected files/folders into a ZIP archive
 */
async function createZipArchive(websiteRoot, sourceRelativePaths = [], destinationZipSubPath) {
  if (!destinationZipSubPath) {
    throw new Error('Destination zip filename required');
  }

  const { target: zipDestFullPath } = resolveSafePath(websiteRoot, destinationZipSubPath);
  const zip = new AdmZip();

  for (const relPath of sourceRelativePaths) {
    const { target: itemFullPath } = resolveSafePath(websiteRoot, relPath);
    if (!fs.existsSync(itemFullPath)) continue;

    const stat = await fs.promises.stat(itemFullPath);
    if (stat.isDirectory()) {
      zip.addLocalFolder(itemFullPath, path.basename(itemFullPath));
    } else {
      zip.addLocalFile(itemFullPath);
    }
  }

  const parentDir = path.dirname(zipDestFullPath);
  if (!fs.existsSync(parentDir)) {
    await fs.promises.mkdir(parentDir, { recursive: true });
  }

  zip.writeZip(zipDestFullPath);

  return {
    success: true,
    zipPath: destinationZipSubPath
  };
}

module.exports = {
  resolveSafePath,
  listFiles,
  readFile,
  writeFile,
  createDirectory,
  deleteItem,
  deleteMultipleItems,
  renameItem,
  extractZipArchive,
  createZipArchive
};
