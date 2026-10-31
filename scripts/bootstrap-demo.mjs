// Parent/operator only, after explicit approval of this exact synthetic hosted target.
import pg from 'pg';
import {migrate,migrationConnectionString} from './migrate.mjs';
import {seedDemo,validateHostedDemoTarget} from './seed-data.mjs';
const connectionString=migrationConnectionString();
validateHostedDemoTarget(connectionString,process.env);
if(!process.env.DEMO_PASSWORD)throw new Error('Supply the separately approved synthetic account password privately.');
const client=new pg.Client({connectionString});await client.connect();
try{
 if((await client.query('SELECT current_database() name')).rows[0].name!=='loopledger_demo')throw new Error('Database identity does not match the approved demo target.');
 await migrate(client);await seedDemo(client,process.env.DEMO_PASSWORD);
 console.log('Synthetic demo migrated and bootstrapped non-destructively. No existing passwords were changed. SMTP was not invoked.');
}finally{await client.end();}
