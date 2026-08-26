const fs = require('fs');
const path = require('path');
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
      items.push({
        name: entry.name,
        isDirectory: entry.isDirectory(),
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

module.exports = {
  resolveSafePath,
  listFiles,
  readFile,
  writeFile,
  createDirectory,
  deleteItem,
  renameItem
};
