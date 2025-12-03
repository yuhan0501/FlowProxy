import * as fs from 'fs';
import * as path from 'path';
import * as forge from 'node-forge';
import { app } from 'electron';

interface CertInfo {
  key: string;
  cert: string;
}

export interface CertManagerStatus {
  hasCA: boolean;
  subject?: string;
  validFrom?: number;
  validTo?: number;
  caCertPath?: string;
  systemTrusted?: boolean;
  systemTrustCheckMessage?: string;
}

export class CertManager {
  private certsDir: string;
  private caKey: forge.pki.rsa.PrivateKey | null = null;
  private caCert: forge.pki.Certificate | null = null;
  private caKeyPem: string = '';
  private caCertPem: string = '';
  private certCache: Map<string, CertInfo> = new Map();

  constructor() {
    const userDataPath = app?.getPath('userData') || path.join(process.env.HOME || '', '.flowproxy');
    this.certsDir = path.join(userDataPath, 'certs');
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.certsDir)) {
      fs.mkdirSync(this.certsDir, { recursive: true });
    }
  }

  /**
   * Initialize CA certificate. If not exists, generate a new one.
   */
  async initCA(): Promise<void> {
    const caKeyPath = path.join(this.certsDir, 'ca.key');
    const caCertPath = path.join(this.certsDir, 'ca.crt');

    if (fs.existsSync(caKeyPath) && fs.existsSync(caCertPath)) {
      this.caKeyPem = fs.readFileSync(caKeyPath, 'utf-8');
      this.caCertPem = fs.readFileSync(caCertPath, 'utf-8');
      this.caKey = forge.pki.privateKeyFromPem(this.caKeyPem);
      this.caCert = forge.pki.certificateFromPem(this.caCertPem);
      console.log('Loaded existing CA certificate');
      return;
    }

    console.log('Generating new CA certificate...');
    const ca = this.generateCACertificate();
    this.caKey = ca.key;
    this.caCert = ca.cert;
    this.caKeyPem = forge.pki.privateKeyToPem(ca.key);
    this.caCertPem = forge.pki.certificateToPem(ca.cert);

    fs.writeFileSync(caKeyPath, this.caKeyPem);
    fs.writeFileSync(caCertPath, this.caCertPem);
    console.log('CA certificate generated and saved');
  }

  /**
   * Get or generate a certificate for the given hostname
   */
  async getCertificateForHost(hostname: string): Promise<CertInfo> {
    if (!this.caKey || !this.caCert) {
      await this.initCA();
    }

    // Check cache first
    if (this.certCache.has(hostname)) {
      return this.certCache.get(hostname)!;
    }

    // Generate certificate for this host
    const cert = this.generateHostCertificate(hostname);
    this.certCache.set(hostname, cert);
    return cert;
  }

  /**
   * Get CA certificate path for installation
   */
  getCACertPath(): string {
    return path.join(this.certsDir, 'ca.crt');
  }

  /**
   * Import CA from PEM strings (user-provided)
   */
  importCAFromPem(caKeyPem: string, caCertPem: string): void {
    const caKeyPath = path.join(this.certsDir, 'ca.key');
    const caCertPath = path.join(this.certsDir, 'ca.crt');

    const key = forge.pki.privateKeyFromPem(caKeyPem);
    const cert = forge.pki.certificateFromPem(caCertPem);

    this.caKey = key;
    this.caCert = cert;
    this.caKeyPem = caKeyPem;
    this.caCertPem = caCertPem;

    fs.writeFileSync(caKeyPath, caKeyPem);
    fs.writeFileSync(caCertPath, caCertPem);
    console.log('Imported external CA certificate');
  }

  /**
   * Get current CA status for UI display
   */
  getStatus(): CertManagerStatus {
    if (!this.caCert) {
      return { hasCA: false };
    }

    const subjectCNAttr = this.caCert.subject.getField('CN');
    const subjectCN = subjectCNAttr ? subjectCNAttr.value : undefined;

    return {
      hasCA: true,
      subject: subjectCN,
      validFrom: this.caCert.validity.notBefore.getTime(),
      validTo: this.caCert.validity.notAfter.getTime(),
      caCertPath: this.getCACertPath(),
    };
  }

  /**
   * Get CA certificate PEM
   */
  getCACertPem(): string {
    return this.caCertPem;
  }

  /**
   * Check if CA certificate exists
   */
  hasCACert(): boolean {
    return this.caKey !== null && this.caCert !== null;
  }

  /**
   * Generate a self-signed CA certificate
   */
  private generateCACertificate(): { key: forge.pki.rsa.PrivateKey; cert: forge.pki.Certificate } {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

    const attrs = [
      { name: 'commonName', value: 'FlowProxy Root CA' },
      { name: 'countryName', value: 'US' },
      { name: 'organizationName', value: 'FlowProxy' },
    ];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    cert.setExtensions([
      { name: 'basicConstraints', cA: true, critical: true },
      { name: 'keyUsage', keyCertSign: true, digitalSignature: true, critical: true },
      { name: 'subjectKeyIdentifier' },
    ]);

    cert.sign(keys.privateKey, forge.md.sha256.create());

    return { key: keys.privateKey, cert };
  }

  /**
   * Generate a certificate for a specific hostname, signed by our CA
   */
  private generateHostCertificate(hostname: string): CertInfo {
    if (!this.caKey || !this.caCert) {
      throw new Error('CA not initialized');
    }

    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = Date.now().toString(16);
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

    const attrs = [
      { name: 'commonName', value: hostname },
      { name: 'organizationName', value: 'FlowProxy' },
    ];

    cert.setSubject(attrs);
    cert.setIssuer(this.caCert.subject.attributes);

    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames: [
        { type: 2, value: hostname }, // DNS
        ...(hostname.match(/^\d+\.\d+\.\d+\.\d+$/) ? [{ type: 7, ip: hostname }] : []), // IP if applicable
      ]},
    ]);

    cert.sign(this.caKey, forge.md.sha256.create());

    return {
      key: forge.pki.privateKeyToPem(keys.privateKey),
      cert: forge.pki.certificateToPem(cert),
    };
  }
}

// Singleton instance
let certManager: CertManager | null = null;

export function getCertManager(): CertManager {
  if (!certManager) {
    certManager = new CertManager();
  }
  return certManager;
}
