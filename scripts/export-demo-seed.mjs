// Pure payload export: no database connection, password derivation or credentials.
import {seedDemo} from './seed-data.mjs';
const marker='__EXPORT_HASH_VALUE__';
const roles={user_admin:'admin',user_staff:'staff',user_maple:'maple',user_north:'north'};
const markers=Object.fromEntries(Object.entries(roles).map(([id,role])=>[id,`__APPROVED_${role.toUpperCase()}_SCRYPT_HASH_SQL_LITERAL__`]));
const statements=[];
function literal(value){if(value===null)return 'NULL';if(typeof value==='number'||typeof value==='boolean')return String(value);return `'${(typeof value==='object'?JSON.stringify(value):String(value)).replaceAll("'","''")}'`;}
await seedDemo({query:async(sql,parameters=[])=>{
 if(sql==='BEGIN'){
  statements.push('BEGIN;',"DO $target$ BEGIN IF current_database() <> 'loopledger_demo' THEN RAISE EXCEPTION 'Only the approved isolated loopledger_demo database is allowed'; END IF; END $target$;");
  for(const [id,role] of Object.entries(roles))statements.push(`SELECT set_config('loopledger.demo_hash_${role}', ${markers[id]}, true);`);
  statements.push("DO $credential$ DECLARE config_key text; BEGIN FOREACH config_key IN ARRAY ARRAY['loopledger.demo_hash_admin','loopledger.demo_hash_staff','loopledger.demo_hash_maple','loopledger.demo_hash_north'] LOOP IF split_part(current_setting(config_key),'$',1) <> 'scrypt' OR split_part(current_setting(config_key),'$',2) !~ '^[0-9a-f]{32}$' OR split_part(current_setting(config_key),'$',3) !~ '^[0-9a-f]{128}$' THEN RAISE EXCEPTION 'Supply approved salted scrypt hashes'; END IF; END LOOP; END $credential$;");return;
 }
 const role=sql.startsWith('INSERT INTO users ')?roles[parameters[0]]:null;
 statements.push(sql.replace(/\$(\d+)/g,(_,index)=>parameters[Number(index)-1]===marker?`current_setting('loopledger.demo_hash_${role}')`:literal(parameters[Number(index)-1]))+';');
}},'ExportOnly!NotAnAccount',{passwordHasher:async()=>marker,log:()=>{}});
if(process.argv.includes('--json')) console.log(JSON.stringify({targetDatabase:'loopledger_demo',requiresVerifiedSchema:'001-005',passwordHashSqlLiteralMarkers:markers,statements:statements.filter(sql=>sql!=='BEGIN;'&&sql!=='COMMIT;')},null,2));
else console.log('-- Generated from scripts/seed-data.mjs. Parent approval and verified schema 001-005 required.\n-- Replace each unquoted marker with the corresponding privately approved salted scrypt hash SQL literal.\n-- Never store substituted SQL/passwords/hashes in Git, artifacts or chat. No reset or SMTP action occurs.\n'+statements.join('\n'));
