const dns = require('dns').promises;
const db = require('../database/db');
const cloudflareService = require('./cloudflare.service');

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

const emailService = {
  /**
   * List all configured email forwarders
   */
  async listForwarders() {
    const forwarders = await db.all('SELECT * FROM email_forwarders ORDER BY created_at DESC');
    return forwarders;
  },

  /**
   * Create or update a forwarder in database
   */
  async createForwarder({ domain, customEmail, destinationEmail, cloudflareRuleId = null, mode = 'manual', brevoConfigured = 0 }) {
    if (!domain || !customEmail || !destinationEmail) {
      throw new Error('Domain, custom email, and destination email are required');
    }

    const cleanDomain = domain.trim().toLowerCase();
    const cleanCustom = customEmail.trim().toLowerCase();
    const cleanDest = destinationEmail.trim().toLowerCase();

    const existing = await db.get(
      'SELECT id FROM email_forwarders WHERE custom_email = ?',
      [cleanCustom]
    );

    if (existing) {
      await db.run(
        `UPDATE email_forwarders 
         SET domain = ?, destination_email = ?, cloudflare_rule_id = ?, mode = ?, brevo_configured = ?
         WHERE id = ?`,
        [cleanDomain, cleanDest, cloudflareRuleId, mode, brevoConfigured ? 1 : 0, existing.id]
      );
      return { id: existing.id, domain: cleanDomain, customEmail: cleanCustom, destinationEmail: cleanDest, updated: true };
    } else {
      const res = await db.run(
        `INSERT INTO email_forwarders (domain, custom_email, destination_email, cloudflare_rule_id, mode, brevo_configured)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [cleanDomain, cleanCustom, cleanDest, cloudflareRuleId, mode, brevoConfigured ? 1 : 0]
      );
      return { id: res.lastID, domain: cleanDomain, customEmail: cleanCustom, destinationEmail: cleanDest, created: true };
    }
  },

  /**
   * Delete an email forwarder
   */
  async deleteForwarder(id) {
    const forwarder = await db.get('SELECT * FROM email_forwarders WHERE id = ?', [id]);
    if (!forwarder) throw new Error('Forwarder not found');

    await db.run('DELETE FROM email_forwarders WHERE id = ?', [id]);
    return { success: true, message: `Forwarder for ${forwarder.custom_email} removed` };
  },

  /**
   * Generate complete DNS record templates for Cloudflare & Brevo
   */
  generateDnsTemplates(domain, brevoCode = '', dmarcEmail = '') {
    const cleanDomain = domain.trim().toLowerCase();
    const domainDash = cleanDomain.replace(/\./g, '-');
    const codeValue = (brevoCode || 'brevo-code:xxxxxxxxxxxxxxxxxxxxxx').trim();
    const dmarcTarget = (dmarcEmail || `dmarc-reports@${cleanDomain}`).trim();

    const records = [
      // Cloudflare Email Routing MX
      {
        type: 'MX',
        name: '@',
        value: 'route1.mx.cloudflare.net',
        priority: 10,
        purpose: 'Cloudflare Inbound Mail Routing (Priority 1)',
        provider: 'cloudflare',
        proxied: false
      },
      {
        type: 'MX',
        name: '@',
        value: 'route2.mx.cloudflare.net',
        priority: 20,
        purpose: 'Cloudflare Inbound Mail Routing (Priority 2)',
        provider: 'cloudflare',
        proxied: false
      },
      {
        type: 'MX',
        name: '@',
        value: 'route3.mx.cloudflare.net',
        priority: 30,
        purpose: 'Cloudflare Inbound Mail Routing (Priority 3)',
        provider: 'cloudflare',
        proxied: false
      },
      // Cloudflare SPF TXT
      {
        type: 'TXT',
        name: '@',
        value: 'v=spf1 include:_spf.mx.cloudflare.net ~all',
        purpose: 'Cloudflare SPF Sender Policy Framework (Single Record Only!)',
        provider: 'cloudflare',
        proxied: false
      },
      // Brevo Verification Code
      {
        type: 'TXT',
        name: '@',
        value: codeValue.startsWith('brevo-code:') ? codeValue : `brevo-code:${codeValue}`,
        purpose: 'Brevo Domain Ownership Verification',
        provider: 'brevo',
        proxied: false
      },
      // Brevo DKIM Keys (CNAME)
      {
        type: 'CNAME',
        name: 'brevo1._domainkey',
        value: `b1.${domainDash}.dkim.brevo.com`,
        purpose: 'Brevo DKIM Digital Signature Key #1 (Gray Cloud DNS Only)',
        provider: 'brevo',
        proxied: false
      },
      {
        type: 'CNAME',
        name: 'brevo2._domainkey',
        value: `b2.${domainDash}.dkim.brevo.com`,
        purpose: 'Brevo DKIM Digital Signature Key #2 (Gray Cloud DNS Only)',
        provider: 'brevo',
        proxied: false
      },
      // Brevo Branded Tracking Subdomains
      {
        type: 'CNAME',
        name: 'mail',
        value: `mail-${domainDash}.brand.brevosend.com`,
        purpose: 'Brevo Branded Mail Subdomain (Gray Cloud DNS Only)',
        provider: 'brevo',
        proxied: false
      },
      {
        type: 'CNAME',
        name: 'r.mail',
        value: `mail-${domainDash}.r.brand.brevosend.com`,
        purpose: 'Brevo Tracking Redirect Subdomain',
        provider: 'brevo',
        proxied: false
      },
      {
        type: 'CNAME',
        name: 'img.mail',
        value: `mail-${domainDash}.img.brand.brevosend.com`,
        purpose: 'Brevo Image Asset Subdomain',
        provider: 'brevo',
        proxied: false
      },
      // DMARC Policy
      {
        type: 'TXT',
        name: '_dmarc',
        value: `v=DMARC1; p=none; rua=mailto:${dmarcTarget}`,
        purpose: 'DMARC Domain-based Message Authentication & Reporting',
        provider: 'dmarc',
        proxied: false
      }
    ];

    // Generate standard BIND format zone file for 1-click import into Cloudflare DNS
    const bindLines = [
      `; ==============================================================================`,
      `; TermuxPanel Professional Email DNS Zone File for ${cleanDomain}`,
      `; ==============================================================================`,
      `${cleanDomain}. 3600 IN MX 10 route1.mx.cloudflare.net.`,
      `${cleanDomain}. 3600 IN MX 20 route2.mx.cloudflare.net.`,
      `${cleanDomain}. 3600 IN MX 30 route3.mx.cloudflare.net.`,
      `${cleanDomain}. 3600 IN TXT "v=spf1 include:_spf.mx.cloudflare.net ~all"`,
      `${cleanDomain}. 3600 IN TXT "${codeValue.startsWith('brevo-code:') ? codeValue : `brevo-code:${codeValue}`}"`,
      `_dmarc.${cleanDomain}. 3600 IN TXT "v=DMARC1; p=none; rua=mailto:${dmarcTarget}"`,
      `brevo1._domainkey.${cleanDomain}. 3600 IN CNAME b1.${domainDash}.dkim.brevo.com.`,
      `brevo2._domainkey.${cleanDomain}. 3600 IN CNAME b2.${domainDash}.dkim.brevo.com.`,
      `mail.${cleanDomain}. 3600 IN CNAME mail-${domainDash}.brand.brevosend.com.`,
      `r.mail.${cleanDomain}. 3600 IN CNAME mail-${domainDash}.r.brand.brevosend.com.`,
      `img.mail.${cleanDomain}. 3600 IN CNAME mail-${domainDash}.img.brand.brevosend.com.`
    ];

    return {
      domain: cleanDomain,
      records,
      bindZoneText: bindLines.join('\n')
    };
  },

  /**
   * Live DNS Propagation and Deliverability Inspector
   */
  async verifyDnsPropagation(domain) {
    const cleanDomain = domain.trim().toLowerCase();
    const result = {
      domain: cleanDomain,
      mx: { status: 'missing', details: [], passed: false },
      spf: { status: 'missing', count: 0, details: '', passed: false, warning: null },
      dkim: { status: 'missing', passed: false, details: '' },
      dmarc: { status: 'missing', passed: false, details: '' },
      overallScore: 0 // percentage
    };

    // 1. Check MX Records
    try {
      const mxRecords = await dns.resolveMx(cleanDomain);
      result.mx.details = mxRecords;
      const hasCfMx = mxRecords.some((r) => r.exchange && r.exchange.includes('cloudflare.net'));
      if (hasCfMx) {
        result.mx.status = 'verified';
        result.mx.passed = true;
      } else if (mxRecords.length > 0) {
        result.mx.status = 'custom_provider';
        result.mx.passed = true;
      }
    } catch (_) {
      result.mx.status = 'unresolved';
    }

    // 2. Check TXT Records (SPF & Brevo Code)
    try {
      const txtRecords = await dns.resolveTxt(cleanDomain);
      const flatTxt = txtRecords.map((chunk) => chunk.join(''));
      const spfRecords = flatTxt.filter((t) => t.startsWith('v=spf1'));

      result.spf.count = spfRecords.length;
      if (spfRecords.length === 1) {
        result.spf.details = spfRecords[0];
        result.spf.passed = true;
        result.spf.status = 'verified';
      } else if (spfRecords.length > 1) {
        result.spf.status = 'error';
        result.spf.warning = 'CRITICAL: Multiple SPF (v=spf1) records detected! Merge into one single record or all outbound mail will fail.';
      }
    } catch (_) {
      result.spf.status = 'unresolved';
    }

    // 3. Check Brevo DKIM CNAME
    try {
      const dkimTarget = `brevo1._domainkey.${cleanDomain}`;
      const cnames = await dns.resolveCname(dkimTarget);
      if (cnames && cnames.length > 0) {
        result.dkim.status = 'verified';
        result.dkim.details = cnames.join(', ');
        result.dkim.passed = true;
      }
    } catch (_) {
      result.dkim.status = 'unresolved';
    }

    // 4. Check DMARC TXT Record
    try {
      const dmarcTxt = await dns.resolveTxt(`_dmarc.${cleanDomain}`);
      const flatDmarc = dmarcTxt.map((c) => c.join('')).find((t) => t.startsWith('v=DMARC1'));
      if (flatDmarc) {
        result.dmarc.status = 'verified';
        result.dmarc.details = flatDmarc;
        result.dmarc.passed = true;
      }
    } catch (_) {
      result.dmarc.status = 'unresolved';
    }

    // Compute Overall Health Score
    let points = 0;
    if (result.mx.passed) points += 30;
    if (result.spf.passed) points += 30;
    if (result.dkim.passed) points += 20;
    if (result.dmarc.passed) points += 20;
    result.overallScore = points;

    return result;
  },

  /**
   * 1-Click Cloudflare Email Routing Automated API Setup
   */
  async setupCloudflareEmailRoutingApi({ domain, customEmail, destinationEmail, apiToken = null }) {
    const token = apiToken || cloudflareService.getSavedApiToken();
    if (!token) {
      throw new Error('Cloudflare API Token is required. Configure it in Settings or Tunnel tab.');
    }

    const cleanDomain = domain.trim().toLowerCase();
    const cleanCustom = customEmail.trim().toLowerCase();
    const cleanDest = destinationEmail.trim().toLowerCase();

    // 1. Discover Zone ID and Account ID from Cloudflare
    const zones = await cloudflareService.listZones();
    const zone = zones.find((z) => cleanDomain === z.name || cleanDomain.endsWith(`.${z.name}`));
    if (!zone) {
      throw new Error(`Domain "${cleanDomain}" was not found in your Cloudflare account zones.`);
    }

    const zoneId = zone.id;
    const accountId = (zone.account && zone.account.id) || null;

    if (!accountId) {
      throw new Error('Cloudflare Account ID could not be resolved for this zone.');
    }

    const results = [];

    // 2. Enable Email Routing for the Zone
    try {
      await this.cfApiCall(`/zones/${zoneId}/email/routing/enabled`, token, 'POST', { enabled: true });
      results.push('✓ Cloudflare Email Routing service enabled');
    } catch (e) {
      results.push(`Email Routing notice: ${e.message}`);
    }

    // 3. Auto-configure DNS MX & SPF records for Email Routing
    try {
      await this.cfApiCall(`/zones/${zoneId}/email/routing/dns`, token, 'POST');
      results.push('✓ Cloudflare MX & SPF DNS records auto-configured');
    } catch (e) {
      results.push(`DNS notice: ${e.message}`);
    }

    // 4. Register destination Gmail address in Cloudflare Account
    try {
      await this.cfApiCall(`/accounts/${accountId}/email/routing/addresses`, token, 'POST', {
        email: cleanDest
      });
      results.push(`✓ Verification email sent to ${cleanDest}`);
    } catch (e) {
      if (e.message.includes('already exists') || e.message.includes('duplicate')) {
        results.push(`✓ Destination ${cleanDest} is already registered`);
      } else {
        results.push(`Destination notice: ${e.message}`);
      }
    }

    // 5. Create Routing Rule (support@domain -> destination)
    let ruleId = null;
    try {
      const ruleRes = await this.cfApiCall(`/zones/${zoneId}/email/routing/rules`, token, 'POST', {
        name: `TermuxPanel Forwarder for ${cleanCustom}`,
        enabled: true,
        matchers: [{ type: 'literal', field: 'to', value: cleanCustom }],
        actions: [{ type: 'forward', value: [cleanDest] }]
      });
      ruleId = ruleRes && ruleRes.id;
      results.push(`✓ Routing rule created: ${cleanCustom} ➔ ${cleanDest}`);
    } catch (e) {
      results.push(`Rule creation notice: ${e.message}`);
    }

    // 6. Save in SQLite
    const saved = await this.createForwarder({
      domain: cleanDomain,
      customEmail: cleanCustom,
      destinationEmail: cleanDest,
      cloudflareRuleId: ruleId,
      mode: 'cloudflare_api',
      brevoConfigured: 0
    });

    return {
      success: true,
      forwarder: saved,
      logs: results,
      message: `Email routing configured for ${cleanCustom}! Check ${cleanDest} to confirm the verification email.`
    };
  },

  /**
   * 1-Click Push Brevo DKIM & DMARC DNS Records to Cloudflare
   */
  async pushBrevoDnsToCloudflare({ domain, brevoCode, dmarcEmail, apiToken = null }) {
    const token = apiToken || cloudflareService.getSavedApiToken();
    if (!token) {
      throw new Error('Cloudflare API Token is required.');
    }

    const cleanDomain = domain.trim().toLowerCase();
    const templates = this.generateDnsTemplates(cleanDomain, brevoCode, dmarcEmail);

    const zones = await cloudflareService.listZones();
    const zone = zones.find((z) => cleanDomain === z.name || cleanDomain.endsWith(`.${z.name}`));
    if (!zone) {
      throw new Error(`Domain "${cleanDomain}" was not found in Cloudflare zones.`);
    }

    const zoneId = zone.id;
    const added = [];

    // Filter Brevo & DMARC records (exclude Cloudflare MX/SPF which are auto-managed)
    const recordsToPush = templates.records.filter((r) => r.provider === 'brevo' || r.provider === 'dmarc');

    for (const rec of recordsToPush) {
      try {
        const fullRecordName = rec.name === '@' ? cleanDomain : `${rec.name}.${cleanDomain}`;
        await this.cfApiCall(`/zones/${zoneId}/dns_records`, token, 'POST', {
          type: rec.type,
          name: fullRecordName,
          content: rec.value,
          proxied: false, // Must be DNS Only (Grey Cloud)
          ttl: 3600,
          comment: 'Managed by TermuxPanel Professional Email'
        });
        added.push(`✓ Added ${rec.type} record for ${rec.name}`);
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('duplicate')) {
          added.push(`• Record ${rec.name} already exists in DNS`);
        } else {
          added.push(`! Failed to add ${rec.name}: ${err.message}`);
        }
      }
    }

    // Update database status
    await db.run('UPDATE email_forwarders SET brevo_configured = 1 WHERE domain = ?', [cleanDomain]);

    return {
      success: true,
      added,
      message: `Brevo DKIM and DMARC DNS records pushed to Cloudflare for ${cleanDomain}!`
    };
  },

  /**
   * Internal HTTPS Request Helper for Cloudflare API
   */
  cfApiCall(endpoint, apiToken, method = 'GET', body = null) {
    const https = require('https');
    return new Promise((resolve, reject) => {
      const url = new URL(`${CF_API_BASE}${endpoint}`);
      const options = {
        method,
        hostname: url.hostname,
        path: url.pathname + url.search,
        timeout: 6000,
        headers: {
          Authorization: `Bearer ${apiToken.trim()}`,
          'Content-Type': 'application/json',
          'User-Agent': 'TermuxPanel-Email-Engine/1.0'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (!parsed.success) {
              const msg = (parsed.errors && parsed.errors.map((e) => e.message).join(', ')) || 'API call failed';
              return reject(new Error(msg));
            }
            resolve(parsed.result);
          } catch (e) {
            reject(new Error(`Failed to parse Cloudflare response: ${data.substring(0, 100)}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Cloudflare API timed out'));
      });

      req.on('error', (err) => reject(err));

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }
};

module.exports = emailService;
