const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const must = (condition, message) => { if (!condition) throw new Error(`FAIL: ${message}`); console.log(`PASS: ${message}`); };
const migrationDir = path.join(root, 'supabase/migrations');
const migration = fs.readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort().map((name) => fs.readFileSync(path.join(migrationDir, name), 'utf8')).join('\n');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const serverPkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const auth = fs.readFileSync(path.join(__dirname, 'auth.js'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, 'supabaseAdmin.js'), 'utf8');
const readiness = fs.readFileSync(path.join(__dirname, 'readiness.js'), 'utf8');

must(Boolean(pkg.dependencies['@supabase/supabase-js']) && !pkg.dependencies.firebase, 'Frontend uses Supabase JS and no Firebase dependency');
must(Boolean(serverPkg.dependencies['@supabase/supabase-js']) && !serverPkg.dependencies['firebase-admin'], 'Backend uses Supabase JS and no Firebase Admin dependency');
must(migration.includes('create table if not exists public.nexus_documents'), 'Postgres document compatibility table exists');
must(migration.includes('enable row level security'), 'RLS is enabled');
must(migration.includes('nexus_is_admin()'), 'Central admin authorization function exists');
must(migration.includes('nexus_has_workspace_access'), 'Workspace isolation helper exists');
must(migration.includes('nexus_on_auth_user_created'), 'Supabase Auth signup trigger exists');
must(auth.includes('verifyIdToken(match[1])') && admin.includes('getUser(accessToken)'), 'Backend authenticates bearer tokens through Supabase Auth');
must(admin.includes('SUPABASE_SECRET_KEY') && !admin.includes('firebase-admin'), 'Server-side secret key is used and Firebase Admin is absent');
must(readiness.includes('SUPABASE_URL') && readiness.includes('SUPABASE_SECRET_KEY'), 'Readiness checks Supabase configuration');
must(!fs.existsSync(path.join(root, 'firebase.json')), 'Firebase hosting configuration removed');
must(!fs.existsSync(path.join(root, 'firestore.rules')), 'Firestore rules removed');
must(!fs.existsSync(path.join(root, 'src/firebase.js')), 'Firebase client module removed');
console.log('SUPABASE_STATIC_SMOKE: PASS');
