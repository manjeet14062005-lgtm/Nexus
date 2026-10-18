const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const children = [];
let stopping = false;

function available(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Port ${port} is already in use. Stop the existing Nexus process before starting another.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
function launch(script, cwd, env = {}) {
  const child = spawn(process.execPath, [script], { cwd, stdio: 'inherit', windowsHide: true, env: { ...process.env, ...env } });
  children.push(child);
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => { if (!stopping) stop(code || 0); });
}
async function main() {
  await Promise.all([available(3000), available(3001)]);
  // Local AI edits must take effect even when the desktop inherited older values.
  // Production entrypoints continue to use deployment-provided environment values.
  const apiEnvPath=path.join(root,'Backend Server/.env');
  const localValues=fs.existsSync(apiEnvPath)?require(path.join(root,'Backend Server/node_modules/dotenv')).parse(fs.readFileSync(apiEnvPath)):{};
  const localAiEnv=Object.fromEntries(['NEXUS_AI_PROVIDER','GEMINI_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_WORKSPACE_ID','ANTHROPIC_MODEL','NEXUS_AI_DEEP_MODEL'].filter(key=>key in localValues).map(key=>[key,localValues[key]]));
  launch(path.join(root, 'Backend Server/server.js'), path.join(root, 'Backend Server'),localAiEnv);
  launch(require.resolve('react-scripts/scripts/start'), root, { BROWSER: 'none', PORT: '3000' });
  console.log('Nexus: http://localhost:3000 — API: http://localhost:3001');
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
main().catch((error) => { console.error(error.message); stop(1); });
