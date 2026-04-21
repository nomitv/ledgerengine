const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, 'backups');
const DB_FILE = path.join(DATA_DIR, 'ledgerengine.db');
const MAX_BACKUPS = 7;

function performBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    return;
  }

  // Use local date string (YYYY-MM-DD)
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const backupFileName = `ledgerengine_${dateStr}.db`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);

  // If a backup for today already exists, do not overwrite it.
  if (fs.existsSync(backupFilePath)) {
    return;
  }

  try {
    // Copy the sqlite database. Using SQLite WAL mode might leave some writes in the WAL file, 
    // but better-sqlite3 handles checkpoints. However, for a simple copy, this is generally safe 
    // enough for lightweight applications, or it will auto-recover from the wal.
    // For perfect safety, the WAL and SHM files should also be copied if they exist.
    fs.copyFileSync(DB_FILE, backupFilePath);
    
    if (fs.existsSync(`${DB_FILE}-wal`)) {
      fs.copyFileSync(`${DB_FILE}-wal`, `${backupFilePath}-wal`);
    }
    if (fs.existsSync(`${DB_FILE}-shm`)) {
      fs.copyFileSync(`${DB_FILE}-shm`, `${backupFilePath}-shm`);
    }

    console.log(`[Backup] Daily database backup created: ${backupFileName}`);

    // Manage retention (keep the last 7 backups)
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('ledgerengine_') && f.endsWith('.db'))
      .map(f => ({ 
        name: f, 
        path: path.join(BACKUP_DIR, f), 
        // We sort by file modification time
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() 
      }))
      .sort((a, b) => b.time - a.time);

    if (backups.length > MAX_BACKUPS) {
      const filesToDelete = backups.slice(MAX_BACKUPS);
      filesToDelete.forEach(file => {
        // Delete main db backup
        fs.unlinkSync(file.path);
        // Delete related wal/shm if present
        if (fs.existsSync(`${file.path}-wal`)) fs.unlinkSync(`${file.path}-wal`);
        if (fs.existsSync(`${file.path}-shm`)) fs.unlinkSync(`${file.path}-shm`);
        
        console.log(`[Backup] Deleted old backup (exceeded 1 week): ${file.name}`);
      });
    }
  } catch (err) {
    console.error('[Backup] Failed to perform database backup:', err);
  }
}

// Start the scheduler that checks every hour to ensure backup happens shortly after midnight
function startBackupScheduler() {
  // Perform an immediate check on startup
  performBackup();
  // Check every hour (3600000 ms)
  setInterval(performBackup, 3600000);
  console.log('[Backup] Daily backup scheduler initialized.');
}

module.exports = { performBackup, startBackupScheduler };

// If executed directly from console (e.g., node backup.js)
if (require.main === module) {
  performBackup();
  console.log('Manual backup execution completed.');
}
