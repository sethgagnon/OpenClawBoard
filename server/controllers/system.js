import os from 'os';
import fs from 'fs';
import { OPENCLAW_DIR, DATA_DIR, WORKSPACE } from '../config.js';
import { formatBytes, formatDuration } from '../lib/format.js';

export function getSystemMetrics(req, res) {
  try {
    const cpus = os.cpus();
    const cpuCount = cpus.length;

    // Calculate CPU usage from load averages
    const loadAvg = os.loadavg();
    const cpuUsage = Math.min(100, Math.round((loadAvg[0] / cpuCount) * 100));

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = Math.round((usedMem / totalMem) * 100);

    const uptime = os.uptime() * 1000; // convert to ms
    const processUptime = process.uptime() * 1000;

    // Disk usage for workspace
    let diskInfo = null;
    try {
      const stats = fs.statfsSync(WORKSPACE);
      const totalDisk = stats.bsize * stats.blocks;
      const freeDisk = stats.bsize * stats.bavail;
      const usedDisk = totalDisk - freeDisk;
      diskInfo = {
        total: totalDisk,
        free: freeDisk,
        used: usedDisk,
        usagePercent: Math.round((usedDisk / totalDisk) * 100),
        totalFormatted: formatBytes(totalDisk),
        freeFormatted: formatBytes(freeDisk),
        usedFormatted: formatBytes(usedDisk),
      };
    } catch {}

    // Count agents
    let agentCount = 0;
    const agentsDir = `${OPENCLAW_DIR}/agents`;
    try {
      if (fs.existsSync(agentsDir)) {
        agentCount = fs.readdirSync(agentsDir).filter(f => {
          const p = `${agentsDir}/${f}`;
          return fs.statSync(p).isDirectory();
        }).length;
      }
    } catch {}

    res.json({
      cpu: {
        model: cpus[0]?.model || 'Unknown',
        cores: cpuCount,
        usage: cpuUsage,
        loadAvg: loadAvg.map(l => Math.round(l * 100) / 100),
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usage: memUsage,
        totalFormatted: formatBytes(totalMem),
        freeFormatted: formatBytes(freeMem),
        usedFormatted: formatBytes(usedMem),
      },
      disk: diskInfo,
      uptime: {
        system: uptime,
        process: processUptime,
        systemFormatted: formatDuration(uptime),
        processFormatted: formatDuration(processUptime),
      },
      platform: {
        os: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        nodeVersion: process.version,
      },
      agents: agentCount,
      paths: {
        openclawDir: OPENCLAW_DIR,
        dataDir: DATA_DIR,
        workspace: WORKSPACE,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
