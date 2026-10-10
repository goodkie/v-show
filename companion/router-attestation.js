/**
 * router-attestation.js
 * 
 * Hardware Router Attestation Manager (Issue #6 R6.9G.10.3.7.1.1).
 * Reads and cryptographically attests GL.iNet GL-SFT1200 (Opal) router identity,
 * WireGuard / OpenVPN tunnel state, and Kill-Switch enforcement.
 * Manages dedicated Ed25519 pairing key generation with Windows DPAPI encryption.
 */

const crypto = require('crypto');
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
  transport: 'ssh', // 'ssh' (production default), 'http', or 'mock'
  sshPort: 22,
  sshUser: 'root',
  sshKeyRef: null, // DPAPI-protected Ed25519 private key
  sshPublicKey: null, // OpenSSH format public key
  expectedFingerprint: null,
  agentTokenRef: null // DPAPI-protected secret ref
};

function formatEd25519OpenSsh(derPublicKey, comment = 'xpider-attest-companion') {
  const rawKey = derPublicKey.subarray(12); // SPKI header is 12 bytes
  const typeBuf = Buffer.from('ssh-ed25519');
  const wireBuf = Buffer.concat([
    Buffer.from([0, 0, 0, typeBuf.length]),
    typeBuf,
    Buffer.from([0, 0, 0, rawKey.length]),
    rawKey
  ]);
  return `ssh-ed25519 ${wireBuf.toString('base64')} ${comment}`;
}

class RouterAttestationManager {
  constructor(options = {}) {
    this.configFile = options.configFile || options.configPath || ROUTER_CONFIG_FILE;
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
        transport: this.config.transport || 'ssh',
        sshPort: this.config.sshPort || 22,
        sshUser: this.config.sshUser || 'root',
        sshKeyRef: this.config.sshKeyRef || null,
        sshPublicKey: this.config.sshPublicKey || null,
        expectedFingerprint: this.config.expectedFingerprint || null,
        agentTokenRef: this.config.agentTokenRef || null
      };
      fs.writeFileSync(this.configFile, JSON.stringify(toSave, null, 2), 'utf8');
      return true;
    } catch (err) {
      throw new Error(`Failed to save router config: ${err.message}`);
    }
  }

  /**
   * Generates a dedicated Ed25519 keypair for router SSH attestation (Blocker 3).
   * Private key is protected via Windows DPAPI and stored in config.
   * Public key is formatted for OpenSSH authorized_keys with forced command.
   */
  generatePairingKey() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const sshPub = formatEd25519OpenSsh(publicKey);
    const encryptedPrivKey = winsec.encrypt ? winsec.encrypt(privateKey) : winsec.protectSecret(privateKey);

    const installCommand = `echo 'command="/usr/bin/xpider-router-attest.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ${sshPub}' >> /etc/dropbear/authorized_keys`;

    this.saveConfig({
      sshKeyRef: encryptedPrivKey,
      sshPublicKey: sshPub
    });

    return {
      publicKey: sshPub,
      installCommand
    };
  }

  getPublicKey() {
    if (this.config.sshPublicKey) {
      return {
        publicKey: this.config.sshPublicKey,
        installCommand: `echo 'command="/usr/bin/xpider-router-attest.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ${this.config.sshPublicKey}' >> /etc/dropbear/authorized_keys`
      };
    }
    return this.generatePairingKey();
  }

  getDriver() {
    if (this.customDriver) {
      if (this.config.expectedFingerprint) {
        this.customDriver.expectedFingerprint = this.config.expectedFingerprint;
      }
      return this.customDriver;
    }

    let tokenOrKey = null;
    if (this.config.sshKeyRef) {
      tokenOrKey = winsec.decrypt ? winsec.decrypt(this.config.sshKeyRef) : winsec.unprotectSecret(this.config.sshKeyRef);
    } else if (this.config.agentTokenRef) {
      tokenOrKey = winsec.decrypt ? winsec.decrypt(this.config.agentTokenRef) : winsec.unprotectSecret(this.config.agentTokenRef);
    }

    if (this.config.routerType === 'OpenWrt Generic') {
      return new OpenWrtReadOnlyDriver({
        routerIp: this.config.routerIp,
        port: this.config.routerPort,
        agentToken: tokenOrKey
      });
    }

    return new GLInetOpalDriver({
      routerIp: this.config.routerIp,
      port: this.config.routerPort,
      sshPort: this.config.sshPort || 22,
      sshUser: this.config.sshUser || 'root',
      transport: this.config.transport || 'ssh',
      expectedFingerprint: this.config.expectedFingerprint,
      agentToken: tokenOrKey
    });
  }

  async attestRouter() {
    const driver = this.getDriver();
    const result = await driver.attest();
    this.lastAttestation = result;
    return result;
  }

  /**
   * Performs trusted router pairing and pins the observed fingerprint.
   * Throws and refuses to save config if attestation fails or router is unreachable.
   */
  async pairRouter(routerIp, expectedFingerprint = null, rawToken = null, routerPort = null, options = {}) {
    let tokenRef = this.config.sshKeyRef || this.config.agentTokenRef;
    if (rawToken) {
      tokenRef = winsec.encrypt ? winsec.encrypt(rawToken) : winsec.protectSecret(rawToken);
    }

    const targetIp = routerIp || this.config.routerIp || '192.168.8.1';
    const targetPort = routerPort !== null ? parseInt(routerPort, 10) : (this.config.routerPort || 80);
    const transport = options.transport || this.config.transport || 'auto';
    const sshPort = options.sshPort !== undefined ? parseInt(options.sshPort, 10) : (this.config.sshPort || 22);
    const sshUser = options.sshUser || this.config.sshUser || 'root';

    let tokenOrKey = rawToken;
    if (!tokenOrKey && tokenRef) {
      tokenOrKey = winsec.decrypt ? winsec.decrypt(tokenRef) : winsec.unprotectSecret(tokenRef);
    }

    let pinnedFingerprint = expectedFingerprint || this.config.expectedFingerprint || null;

    // Trust-On-First-Use (TOFU) (Blockers 1, 2, 4):
    // 1. Probe router to observe its live identity
    const probeDriver = this.customDriver || new GLInetOpalDriver({
      routerIp: targetIp,
      port: targetPort,
      sshPort,
      sshUser,
      expectedFingerprint: null,
      agentToken: tokenOrKey,
      transport
    });

    const probeRes = await probeDriver.attest();
    if (!probeRes || !probeRes.reachable) {
      throw new Error(`PAIRING_FAILED: Router probe unreachable at ${targetIp}: ${probeRes ? probeRes.error : 'NO_RESPONSE'}`);
    }

    if (!probeRes.routerFingerprint) {
      throw new Error('PAIRING_FAILED: Could not retrieve router fingerprint from probe.');
    }

    pinnedFingerprint = expectedFingerprint || probeRes.routerFingerprint;

    // 2. Perform immediate verification using pinned fingerprint and selected transport
    const chosenTransport = (transport === 'auto')
      ? (probeRes.vpn && probeRes.vpn.protocol !== 'UNKNOWN' ? 'auto' : 'http')
      : transport;

    if (this.customDriver) {
      this.customDriver.expectedFingerprint = pinnedFingerprint;
    }

    const verifyDriver = this.customDriver || new GLInetOpalDriver({
      routerIp: targetIp,
      port: targetPort,
      sshPort,
      sshUser,
      expectedFingerprint: pinnedFingerprint,
      agentToken: tokenOrKey,
      transport: chosenTransport
    });

    const verifyRes = await verifyDriver.attest();
    if (!verifyRes || !verifyRes.reachable || !verifyRes.identityVerified) {
      throw new Error(`PAIRING_FAILED: Post-pairing immediate attestation failed: ${verifyRes ? verifyRes.error : 'Identity mismatch'}`);
    }

    // 3. Persist valid pairing configuration ONLY after successful verification
    this.saveConfig({
      enabled: true,
      routerIp: targetIp,
      routerPort: targetPort,
      transport: chosenTransport,
      sshPort,
      sshUser,
      expectedFingerprint: pinnedFingerprint,
      agentTokenRef: tokenRef
    });

    verifyRes.success = Boolean(verifyRes.reachable && verifyRes.identityVerified);
    this.lastAttestation = verifyRes;
    return verifyRes;
  }
}

module.exports = {
  RouterAttestationManager,
  ROUTER_CONFIG_FILE,
  DEFAULT_ROUTER_CONFIG
};
