import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const paths=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean).filter(p=>!/(^|\/)(\.env[^/]*|\.git|node_modules|output)(\/|$)/.test(p));
const files=[];for(const file of paths){const bytes=await readFile(file);files.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
console.log(JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files},null,2));
