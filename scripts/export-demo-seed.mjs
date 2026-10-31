// Pure SQL payload export. No database connection or actual credentials are created.
import {seedDemo} from './seed-data.mjs';
const marker='__APPROVED_SCRYPT_HASH_SQL_LITERAL__';
const statements=[];
function literal(value){if(value===null)return 'NULL';if(typeof value==='number'||typeof value==='boolean')return String(value);return `'${(typeof value==='object'?JSON.stringify(value):String(value)).replaceAll("'","''")}'`;}
await seedDemo({query:async(sql,parameters=[])=>{
 if(sql==='BEGIN'){
  statements.push('BEGIN;',
   "DO $target$ BEGIN IF current_database() <> 'loopledger_demo' THEN RAISE EXCEPTION 'Only the approved isolated loopledger_demo database is allowed'; END IF; END $target$;",
   `SELECT set_config('loopledger.demo_password_hash', ${marker}, true);`,
   "DO $credential$ BEGIN IF split_part(current_setting('loopledger.demo_password_hash'),'$',1) <> 'scrypt' OR split_part(current_setting('loopledger.demo_password_hash'),'$',2) !~ '^[0-9a-f]{32}$' OR split_part(current_setting('loopledger.demo_password_hash'),'$',3) !~ '^[0-9a-f]{128}$' THEN RAISE EXCEPTION 'Supply an approved salted scrypt hash'; END IF; END $credential$;");return;
 }
 statements.push(sql.replace(/\$(\d+)/g,(_,index)=>parameters[Number(index)-1]===marker?"current_setting('loopledger.demo_password_hash')":literal(parameters[Number(index)-1]))+';');
}},'ExportOnly!NotAnAccount',{passwordHasher:async()=>marker,log:()=>{}});
if(process.argv.includes('--json')) console.log(JSON.stringify({targetDatabase:'loopledger_demo',requiresVerifiedSchema:'001-005',passwordHashSqlLiteralMarker:marker,statements:statements.filter(sql=>sql!=='BEGIN;'&&sql!=='COMMIT;')},null,2));
else console.log('-- Generated from scripts/seed-data.mjs. Parent approval and verified schema 001-005 required.\n-- Replace the unquoted marker with ONE privately approved SQL string literal containing a salted scrypt hash.\n-- Never store the substituted SQL/password/hash in Git, artifacts or chat. No reset or SMTP action occurs.\n'+statements.join('\n'));
