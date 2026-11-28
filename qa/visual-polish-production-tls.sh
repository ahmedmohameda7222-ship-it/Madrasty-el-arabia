#!/usr/bin/env bash
# CI-only disposable fixture. Never point this script at a school database.
set -euo pipefail
test "${GITHUB_ACTIONS:-}" = true
test "${GITHUB_REF:-}" = refs/heads/visual-polish/premium
test -n "${LOCALAPPDATA:-}"
test "$LOCALAPPDATA" = "$RUNNER_TEMP"
target="$LOCALAPPDATA/MadrastyBuild/qa-supabase"
container=supabase_db_madrasty_final_qa
test "$(docker inspect --format '{{ index .Config.Labels "com.supabase.cli.project" }}' "$container")" = madrasty_final_qa
test "$(docker inspect --format '{{ index .Config.Labels "com.supabase.cli.workdir" }}' "$container")" = "$target"
test "$(docker port "$container" 5432/tcp | head -n 1 | awk -F: '{print $NF}')" = 55422
grep -qx 'QA_PROJECT=madrasty_final_qa' qa/.env.local
grep -qx 'QA_ORIGIN=http://127.0.0.1:4300' qa/.env.local
grep -qx 'QA_AUTH=http://127.0.0.1:55421' qa/.env.local
grep -qx 'SCHOOL_ENVIRONMENT=prelaunch' qa/.env.local
tls="$target/visual-tls"
umask 077
mkdir "$tls"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -sha256 -subj '/CN=Madrasty disposable fixture CA' \
  -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign' \
  -keyout "$tls/ca.key" -out "$tls/ca.crt" >/dev/null 2>&1
printf '%s\n' 'basicConstraints=critical,CA:FALSE' 'keyUsage=critical,digitalSignature,keyEncipherment' 'extendedKeyUsage=serverAuth' 'subjectAltName=IP:127.0.0.1,DNS:localhost' > "$tls/server.ext"
for name in database web; do
  openssl req -new -newkey rsa:2048 -nodes -subj "/CN=Madrasty fixture $name" -keyout "$tls/$name.key" -out "$tls/$name.csr" >/dev/null 2>&1
  openssl x509 -req -in "$tls/$name.csr" -CA "$tls/ca.crt" -CAkey "$tls/ca.key" -CAcreateserial \
    -days 1 -sha256 -extfile "$tls/server.ext" -out "$tls/$name.crt" >/dev/null 2>&1
  openssl verify -CAfile "$tls/ca.crt" -verify_ip 127.0.0.1 "$tls/$name.crt"
done
# CA private key is no longer needed. No certificates/keys are uploaded.
rm -f "$tls/ca.key" "$tls/"*.csr "$tls/ca.srl"
docker exec -u 0 "$container" mkdir -m 700 /tmp/madrasty-visual-tls
docker cp "$tls/database.crt" "$container:/tmp/madrasty-visual-tls/server.crt"
docker cp "$tls/database.key" "$container:/tmp/madrasty-visual-tls/server.key"
docker exec -u 0 "$container" chown -R postgres:postgres /tmp/madrasty-visual-tls
docker exec -u 0 "$container" chmod 600 /tmp/madrasty-visual-tls/server.key
# Only this isolated container's TLS transport settings are changed.
# Existing HBA, roles, schemas, policies and migrations are untouched.
sql() { docker exec "$container" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
sql "ALTER SYSTEM SET ssl_cert_file = '/tmp/madrasty-visual-tls/server.crt'"
sql "ALTER SYSTEM SET ssl_key_file = '/tmp/madrasty-visual-tls/server.key'"
sql "ALTER SYSTEM SET ssl = on"
sql 'select pg_reload_conf()'
# Verify encrypted transport with the same restricted runtime login and CA
# verification used by the application; do not print any URL or credential.
export VISUAL_FIXTURE_CA="$tls/ca.crt"
node --env-file=qa/.env.local --input-type=module <<'JS'
import postgres from "postgres";
import { readFileSync } from "node:fs";
const url = new URL(process.env.DATABASE_URL);
if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.port !== "55422" || url.username !== "madrasty_qa_runtime" || url.pathname !== "/postgres" || url.search || url.hash) throw new Error("Unexpected restricted database binding");
const ca = readFileSync(process.env.VISUAL_FIXTURE_CA, "utf8");
let verified = false;
for (let attempt=0; attempt<12 && !verified; attempt++) {
  const sql = postgres(url.href, { ssl: { ca, rejectUnauthorized: true }, prepare:false, max:1, connect_timeout:3 });
  try {
    const [row] = await sql`select ssl, version from pg_stat_ssl where pid=pg_backend_pid()`;
    if (row?.ssl === true) { console.log("Verified restricted fixture database TLS:", row.version); verified=true; }
  } catch { /* only fixed diagnostic after bounded local startup check */ }
  finally { await sql.end({timeout:1}); }
  if (!verified) await new Promise(resolve=>setTimeout(resolve,1000));
}
if (!verified) throw new Error("Restricted fixture database TLS verification failed");
JS
# Trust only this runner's disposable CA for real HTTPS browser/API requests.
sudo install -m 644 "$tls/ca.crt" /usr/local/share/ca-certificates/madrasty-visual-fixture.crt
sudo update-ca-certificates >/dev/null
mkdir -p "$HOME/.pki/nssdb"
if [ ! -f "$HOME/.pki/nssdb/cert9.db" ]; then certutil -N --empty-password -d "sql:$HOME/.pki/nssdb"; fi
certutil -A -d "sql:$HOME/.pki/nssdb" -n madrasty-visual-fixture -t 'C,,' -i "$tls/ca.crt"
printf 'NODE_EXTRA_CA_CERTS=%s\n' "$tls/ca.crt" >> "$GITHUB_ENV"
