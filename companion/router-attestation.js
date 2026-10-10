/**
 * router-attestation.js
 * 
 * Hardware Router Attestation Manager (Issue #6 R6.9G.10.3.7).
 * Reads and cryptographically attests GL.iNet GL-SFT1200 (Opal) router identity,
 * WireGuard / OpenVPN tunnel state, and Kill-Switch enforcement.
 */

const fs = require('fs');
const path = require('path');
const winsec = require('./winsec');
const { GLInetOpalDriver } = require('./router-drivers/glinet-opal');
const { OpenWrtReadOnlyDriver } = require('./router-drivers/openwrt-readonly');

const ROUTER_CONFIG_FILE = path.join(__dirname, 'router_pairing_config.json');

const DEFAULT_ROUTER_CONFIG = {
  enabled: false,
  routerType: 'GL.iNet GL-SFT1200',
  routerIp: '192.168.8.1',
  routerPort: 80,
  expectedFingerprint: null,
  agentTokenRef: null // DPAPI-protected secret ref
};

class RouterAttestationManager {
  constructor(options = {}) {
    this.configFile = options.configFile || ROUTER_CONFIG_FILE;
    this.config = this.loadConfig();
    this.driver = null;
    this.lastAttestation = null;
    this.customDriver = options.customDriver || null;
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        return { ...DEFAULT_ROUTER_CONFIG, ...JSON.parse(fs.readFileSync(this.configFile, 'utf8')) };
      }
    } catch (_) {}
    return { ...DEFAULT_ROUTER_CONFIG };
  }

  saveConfig(updates = {}) {
    this.config = { ...this.config, ...updates };
    try {
      const toSave = {
        enabled: Boolean(this.config.enabled),
        routerType: this.config.routerType || 'GL.iNet GL-SFT1200',
        routerIp: this.config.routerIp || '192.168.8.1',
        routerPort: this.config.routerPort || 80,
        expectedFingerprint: this.config.expectedFingerprint || null,
        agentTokenRef: this.config.agentTokenRef || null
      };
      fs.writeFileSync(this.configFile, JSON.stringify(toSave, null, 2), 'utf8');
      return true;
    } catch (err) {
      throw new Error(`Failed to save router config: ${err.message}`);
    }
  }

  getDriver() {
    if (this.customDriver) {
      if (this.config.expectedFingerprint) {
        this.customDriver.expectedFingerprint = this.config.expectedFingerprint;
      }
      return this.customDriver;
    }
    let token = null;
    if (this.config.agentTokenRef) {
      token = winsec.decrypt ? winsec.decrypt(this.config.agentTokenRef) : winsec.unprotectSecret(this.config.agentTokenRef);
    }

    if (this.config.routerType === 'OpenWrt Generic') {
      return new OpenWrtReadOnlyDriver({
        routerIp: this.config.routerIp,
        port: this.config.routerPort,
        agentToken: token
      });
    }

    return new GLInetOpalDriver({
      routerIp: this.config.routerIp,
      port: this.config.routerPort,
      expectedFingerprint: this.config.expectedFingerprint,
      agentToken: token
    });
  }

  async attestRouter() {
    const driver = this.getDriver();
    const result = await driver.attest();
    this.lastAttestation = result;
    return result;
  }

  async pairRouter(routerIp, expectedFingerprint = null, rawToken = null, routerPort = null, options = {}) {
    let tokenRef = this.config.agentTokenRef;
    if (rawToken) {
      tokenRef = winsec.encrypt ? winsec.encrypt(rawToken) : winsec.protectSecret(rawToken);
    }

    const targetIp = routerIp || this.config.routerIp || '192.168.8.1';
    const targetPort = routerPort !== null ? parseInt(routerPort, 10) : (this.config.routerPort || 80);

    let pinnedFingerprint = expectedFingerprint || this.config.expectedFingerprint || null;

    // Trust-On-First-Use (TOFU) (Blocker 4):
    // If no expected fingerprint is provided, explicitly query the router to observe and pin its identity
    if (!pinnedFingerprint) {
      const probeDriver = this.customDriver || new GLInetOpalDriver({
        routerIp: targetIp,
        port: targetPort,
        expectedFingerprint: null,
        agentToken: rawToken,
        transport: options.transport || 'auto'
      });
      const probeRes = await probeDriver.attest();
      if (probeRes && probeRes.routerFingerprint) {
        pinnedFingerprint = probeRes.routerFingerprint;
      }
    }

    if (!pinnedFingerprint) {
      throw new Error('PAIRING_FAILED: Could not retrieve or pin router fingerprint. Router must be reachable.');
    }

    this.saveConfig({
      enabled: true,
      routerIp: targetIp,
      routerPort: targetPort,
      expectedFingerprint: pinnedFingerprint,
      agentTokenRef: tokenRef
    });

    // Re-verify immediately with pinned fingerprint enforced
    return await this.attestRouter();
  }
}

module.exports = {
  RouterAttestationManager,
  ROUTER_CONFIG_FILE,
  DEFAULT_ROUTER_CONFIG
};
