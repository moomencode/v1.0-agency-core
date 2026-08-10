import fs from 'node:fs';
import path from 'node:path';
import { writeZip, readZip } from '../packaging/zip.js';
import { LocalProvider } from '../providers/local.js';
import { scratchRoot, assert, runTests } from './helpers.mjs';

const tests = [
  ['readZip drops ../ traversal entry', () => {
    const buf = writeZip({ '../escape.txt': 'x' });
    const back = readZip(buf);
    assert(!('..\\escape.txt' in back) && !('../escape.txt' in back) && Object.keys(back).length === 0, 'traversal entry dropped');
  }],
  ['readZip drops ../../ traversal entry', () => {
    const back = readZip(writeZip({ '../../escape.txt': 'x' }));
    assert(Object.keys(back).length === 0, 'deep traversal entry dropped');
  }],
  ['readZip drops absolute path entry', () => {
    const back = readZip(writeZip({ '/etc/passwd': 'x' }));
    assert(Object.keys(back).length === 0, 'absolute entry dropped');
  }],
  ['readZip drops drive-letter entry', () => {
    const back = readZip(writeZip({ 'C:/windows/win.ini': 'x' }));
    assert(Object.keys(back).length === 0, 'drive-letter entry dropped');
  }],
  ['readZip drops Windows backslash traversal entry', () => {
    const back = readZip(writeZip({ '..\\escape.txt': 'x' }));
    assert(Object.keys(back).length === 0, 'backslash traversal dropped');
  }],
  ['readZip drops mixed-separator traversal entry', () => {
    const back = readZip(writeZip({ 'folder\\..\\..\\escape.txt': 'x' }));
    assert(Object.keys(back).length === 0, 'mixed separator traversal dropped');
  }],
  ['readZip drops embedded traversal in nested path', () => {
    const back = readZip(writeZip({ 'a/b/../../escape.txt': 'x' }));
    assert(Object.keys(back).length === 0, 'embedded traversal dropped');
  }],
  ['readZip preserves valid nested directory file', () => {
    const back = readZip(writeZip({ 'css/site.css': '.x{}', 'deep/nested/file.txt': 'y' }));
    assert(back['css/site.css'] === '.x{}' && back['deep/nested/file.txt'] === 'y', 'valid nested paths preserved');
  }],
  ['readZip normalizes dot segments but keeps the path', () => {
    const back = readZip(writeZip({ 'a/./b.txt': 'z' }));
    assert(back['a/b.txt'] === 'z', 'dot segment normalized without loss');
  }],
  ['LocalProvider never writes outside its deploy root', async () => {
    const root = scratchRoot('zip-slip-provider');
    fs.mkdirSync(root, { recursive: true });
    const provider = new LocalProvider({ project: 'zip-slip' }, { root });
    const bundlePath = path.join(root, 'hostile-bundle.zip');
    fs.writeFileSync(bundlePath, writeZip({
      '../escape.txt': 'x',
      '..\\escape2.txt': 'y',
      '/absolute.txt': 'z',
      'ok.txt': 'ok'
    }));
    await provider.deploy({ bundlePath, packageId: 'aaaabbbbccccdddd' });
    const deployedRoot = path.join(root, 'storage', 'delivery', 'local', 'zip-slip', 'local-aaaabbbbccccdddd');
    assert(fs.existsSync(path.join(deployedRoot, 'ok.txt')), 'valid file extracted inside deploy root');
    const entries = fs.readdirSync(deployedRoot);
    assert(entries.length === 1 && entries[0] === 'ok.txt', `only safe entries extracted, got ${entries.join(',')}`);
    assert(!fs.existsSync(path.join(root, 'escape.txt')), 'no file escaped to provider root');
    assert(!fs.existsSync(path.join(root, 'escape2.txt')), 'no backslash-traversal escape');
    assert(!fs.existsSync(path.join(root, 'absolute.txt')), 'no absolute-path escape');
  }]
];

await runTests('delivery/zip-slip', tests);
