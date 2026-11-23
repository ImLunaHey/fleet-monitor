import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [version, directory] = process.argv.slice(2);
if (!/^v\d+\.\d+\.\d+$/.test(version ?? '') || !directory) throw Error('Expected version and artifact directory');
const names = ['fleet-monitor-dashboard.html', ...['x86_64-linux','aarch64-linux','x86_64-darwin','aarch64-darwin'].map(s=>`fleet-monitor-${s}`)];
const assets = {};
const sums = [];
for (const name of names) {
 const bytes = fs.readFileSync(path.join(directory,name));
 const digest = crypto.createHash('sha256').update(bytes).digest();
 assets[name] = `sha256-${digest.toString('base64')}`;
 sums.push(`${digest.toString('hex')}  ${name}`);
}
fs.writeFileSync(path.join(directory,'release.json'),JSON.stringify({version,assets},null,2)+'\n');
fs.writeFileSync(path.join(directory,'SHA256SUMS'),sums.join('\n')+'\n');
