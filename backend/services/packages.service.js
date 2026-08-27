const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const db = require('../database/db');

const packagesService = {
  /**
   * List packages/dependencies for a website
   */
  async listPackages(websiteId) {
    const site = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!site) throw new Error('Website not found');

    const rootPath = site.root_path;
    const type = site.type; // node, python, html, php

    if (type === 'node') {
      return await this.listNodePackages(rootPath);
    } else if (type === 'python') {
      return await this.listPythonPackages(rootPath);
    } else {
      return {
        type,
        packages: [],
        message: `Package management is not required for ${type.toUpperCase()} static sites.`
      };
    }
  },

  /**
   * Parse Node.js packages from package.json and node_modules
   */
  async listNodePackages(rootPath) {
    const pkgJsonPath = path.join(rootPath, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      return {
        type: 'node',
        hasManifest: false,
        packages: [],
        message: 'No package.json found in website root.'
      };
    }

    try {
      const raw = fs.readFileSync(pkgJsonPath, 'utf8');
      const manifest = JSON.parse(raw);
      const dependencies = manifest.dependencies || {};
      const devDependencies = manifest.devDependencies || {};

      const list = [];

      // Check prod dependencies
      for (const [name, targetVersion] of Object.entries(dependencies)) {
        let installedVersion = null;
        const subPkgPath = path.join(rootPath, 'node_modules', name, 'package.json');
        if (fs.existsSync(subPkgPath)) {
          try {
            const subData = JSON.parse(fs.readFileSync(subPkgPath, 'utf8'));
            installedVersion = subData.version;
          } catch (_) {}
        }
        list.push({
          name,
          declaredVersion: targetVersion,
          installedVersion: installedVersion || 'Not Installed',
          isDev: false,
          status: installedVersion ? 'installed' : 'missing'
        });
      }

      // Check dev dependencies
      for (const [name, targetVersion] of Object.entries(devDependencies)) {
        let installedVersion = null;
        const subPkgPath = path.join(rootPath, 'node_modules', name, 'package.json');
        if (fs.existsSync(subPkgPath)) {
          try {
            const subData = JSON.parse(fs.readFileSync(subPkgPath, 'utf8'));
            installedVersion = subData.version;
          } catch (_) {}
        }
        list.push({
          name,
          declaredVersion: targetVersion,
          installedVersion: installedVersion || 'Not Installed',
          isDev: true,
          status: installedVersion ? 'installed' : 'missing'
        });
      }

      return {
        type: 'node',
        hasManifest: true,
        packages: list,
        name: manifest.name || 'node-app',
        version: manifest.version || '1.0.0'
      };
    } catch (err) {
      throw new Error(`Failed to parse package.json: ${err.message}`);
    }
  },

  /**
   * Parse Python packages from requirements.txt and pip list
   */
  async listPythonPackages(rootPath) {
    const reqPath = path.join(rootPath, 'requirements.txt');
    const reqPackages = new Map();

    if (fs.existsSync(reqPath)) {
      try {
        const lines = fs.readFileSync(reqPath, 'utf8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const parts = trimmed.split(/[=<>~]/);
            const name = parts[0].trim();
            const version = trimmed.replace(name, '').trim();
            reqPackages.set(name.toLowerCase(), { name, declared: version || '*' });
          }
        }
      } catch (_) {}
    }

    // Query pip installed packages in json format
    let installedMap = new Map();
    try {
      const res = await execPromise('pip list --format=json', { cwd: rootPath });
      const pipList = JSON.parse(res.stdout || '[]');
      for (const p of pipList) {
        installedMap.set(p.name.toLowerCase(), p.version);
      }
    } catch (_) {}

    const list = [];
    // Combine requirements with installed status
    for (const [key, info] of reqPackages.entries()) {
      const installedVer = installedMap.get(key);
      list.push({
        name: info.name,
        declaredVersion: info.declared,
        installedVersion: installedVer || 'Not Installed',
        isDev: false,
        status: installedVer ? 'installed' : 'missing'
      });
      installedMap.delete(key);
    }

    // Add other installed pip packages
    for (const [name, version] of installedMap.entries()) {
      // Filter out standard setuptools/pip clutter
      if (['pip', 'setuptools', 'wheel'].includes(name)) continue;
      list.push({
        name,
        declaredVersion: 'unlisted',
        installedVersion: version,
        isDev: false,
        status: 'installed'
      });
    }

    return {
      type: 'python',
      hasManifest: fs.existsSync(reqPath),
      packages: list
    };
  },

  /**
   * Install a package for a website
   */
  async installPackage(websiteId, packageName, isDev = false) {
    const site = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!site) throw new Error('Website not found');

    const cleanPkg = (packageName || '').trim().replace(/[^a-zA-Z0-9@_.\-/]/g, '');
    if (!cleanPkg) throw new Error('Invalid package name');

    const rootPath = site.root_path;

    if (site.type === 'node') {
      const flag = isDev ? '--save-dev' : '--save';
      const cmd = `npm install ${cleanPkg} ${flag}`;
      const res = await execPromise(cmd, { cwd: rootPath });
      return { success: true, message: `Package "${cleanPkg}" installed!`, output: res.stdout || res.stderr };
    } else if (site.type === 'python') {
      const cmd = `pip install ${cleanPkg}`;
      const res = await execPromise(cmd, { cwd: rootPath });

      // Append to requirements.txt if not already present
      const reqPath = path.join(rootPath, 'requirements.txt');
      let currentReq = fs.existsSync(reqPath) ? fs.readFileSync(reqPath, 'utf8') : '';
      if (!currentReq.toLowerCase().includes(cleanPkg.toLowerCase())) {
        fs.appendFileSync(reqPath, `\n${cleanPkg}\n`, 'utf8');
      }

      return { success: true, message: `Python package "${cleanPkg}" installed!`, output: res.stdout || res.stderr };
    } else {
      throw new Error(`Package installation not supported for site type: ${site.type}`);
    }
  },

  /**
   * Uninstall a package
   */
  async uninstallPackage(websiteId, packageName) {
    const site = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!site) throw new Error('Website not found');

    const cleanPkg = (packageName || '').trim().replace(/[^a-zA-Z0-9@_.\-/]/g, '');
    if (!cleanPkg) throw new Error('Invalid package name');

    const rootPath = site.root_path;

    if (site.type === 'node') {
      const cmd = `npm uninstall ${cleanPkg}`;
      const res = await execPromise(cmd, { cwd: rootPath });
      return { success: true, message: `Package "${cleanPkg}" uninstalled`, output: res.stdout };
    } else if (site.type === 'python') {
      const cmd = `pip uninstall -y ${cleanPkg}`;
      const res = await execPromise(cmd, { cwd: rootPath });

      // Remove from requirements.txt
      const reqPath = path.join(rootPath, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const lines = fs.readFileSync(reqPath, 'utf8').split('\n');
        const filtered = lines.filter((l) => !l.toLowerCase().startsWith(cleanPkg.toLowerCase()));
        fs.writeFileSync(reqPath, filtered.join('\n'), 'utf8');
      }

      return { success: true, message: `Python package "${cleanPkg}" uninstalled`, output: res.stdout };
    } else {
      throw new Error(`Package uninstallation not supported for: ${site.type}`);
    }
  },

  /**
   * Update all packages
   */
  async updateAllPackages(websiteId) {
    const site = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!site) throw new Error('Website not found');

    const rootPath = site.root_path;

    if (site.type === 'node') {
      const res = await execPromise('npm update', { cwd: rootPath });
      return { success: true, message: 'Node dependencies updated', output: res.stdout };
    } else if (site.type === 'python') {
      const reqPath = path.join(rootPath, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const res = await execPromise('pip install --upgrade -r requirements.txt', { cwd: rootPath });
        return { success: true, message: 'Python packages updated from requirements.txt', output: res.stdout };
      }
      return { success: true, message: 'No requirements.txt found to update' };
    } else {
      throw new Error(`Package update not supported for: ${site.type}`);
    }
  }
};

module.exports = packagesService;
