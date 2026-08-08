import fs from 'node:fs';
import path from 'node:path';

export function killSwitch({ root = null } = {}) {
  const file = root ? path.join(root, 'EMERGENCY_STOP') : null;
  const env = process.env.ORC_EMERGENCY_STOP;
  return {
    isActive() {
      if (env === '1' || env === 'true') return true;
      return file ? fs.existsSync(file) : false;
    },
    activate() {
      if (!file) return;
      fs.writeFileSync(file, 'emergency stop\n');
    },
    clear() {
      if (!file) return;
      try {
        fs.unlinkSync(file);
      } catch {
        /* not present */
      }
    },
    file
  };
}
