# dn’a-C08.04 — Free Usage Identity & Normalization

## 1. Business Name Normalization Algorithm
```javascript
function normalizeBusinessName(name) {
  if (!name || typeof name !== 'string') return '';
  let clean = name.toLowerCase().trim();
  // Remove punctuation (dots, commas, dashes, quotes)
  clean = clean.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
  // Normalize whitespace
  clean = clean.replace(/\s+/g, ' ');
  // Strip legal suffixes (inc, llc, corp, ltd, co, gmbh, sa)
  const suffixes = ['inc', 'incorporated', 'llc', 'corp', 'corporation', 'ltd', 'limited', 'co', 'company', 'gmbh', 'sa'];
  const words = clean.split(' ');
  if (words.length > 1 && suffixes.includes(words[words.length - 1])) {
    words.pop();
    clean = words.join(' ');
  }
  return clean.trim();
}
```

## 2. Privacy-Preserving IP Hashing
```javascript
function hashIpAddress(ip, serverSecret) {
  const normalizedIp = (ip || '').replace(/^::ffff:/, '').trim();
  return crypto.createHmac('sha256', serverSecret).update(normalizedIp).digest('hex').substring(0, 32);
}
```

## 3. Data Record Schema (`db.freePreviewUsages`)
```typescript
interface FreePreviewUsage {
  usageId: string;
  normalizedBusinessName: string;
  ipHash: string;
  deviceIdHash?: string;
  projectId: string;
  generationStatus: 'SUCCESS' | 'FAILED' | 'UPGRADED';
  generationCount: number;
  createdAt: string;
  lastAttemptAt: string;
}
```
