import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export const EU_D1_SOURCE='klassenportal-commercial';
export const EU_D1_TARGET='klassenportal-commercial-eu';
export const EU_D1_TARGET_ID='a060de73-a4f6-4410-b4f2-25f5bee87754';
export const EU_D1_MARKER_TABLE='platform_eu_storage_cutover';
export const EU_D1_FREEZE_PREFIX='kp_eu_cutover_freeze_';
export const EU_D1_IMPORT_STATEMENT_BYTES=90_000;
export const EU_D1_IMPORT_LITERAL_CHUNK_BYTES=32_000;
export const EU_D1_SCHEMA_ONLY_COUNTS={
  accounting_settings:1,
  billing_provider_state:1,
  commerce_policy:1,
  d1_migrations:69,
  legal_configuration:1,
  managed_setup_options:5,
  module_commerce_rules:5,
  plan_commerce_rules:3,
  plans:3,
  seller_billing_profile:1,
  stripe_provider_modes:2,
  users:2,
};
export const EU_D1_SCHEMA_ONLY_USERS=['system_intake_service','system_workflow_service'];

export function sqlIdentifier(value){return `"${String(value).replaceAll('"','""')}"`;}
export function sqlText(value){return `'${String(value).replaceAll("'","''")}'`;}
function byteLength(value){return Buffer.byteLength(String(value),'utf8');}
function triggerStatement(tokens){
  return tokens[0]==='CREATE'&&(tokens[1]==='TRIGGER'||(['TEMP','TEMPORARY'].includes(tokens[1])&&tokens[2]==='TRIGGER'));
}
export function splitD1ExportStatements(value){
  const sql=String(value),statements=[];let start=0,index=0,state='normal',word='',tokens=[],trigger=false,blocks=[];
  const acceptWord=()=>{
    if(!word)return;
    const token=word.toUpperCase();tokens.push(token);word='';
    if(tokens.length<=3)trigger=triggerStatement(tokens);
    if(trigger){
      if(token==='BEGIN'||token==='CASE')blocks.push(token);
      else if(token==='END'&&blocks.length)blocks.pop();
    }
  };
  const finish=end=>{
    const statement=sql.slice(start,end);
    if(statement.trim())statements.push(statement);
    start=end;tokens=[];trigger=false;blocks=[];word='';
  };
  while(index<sql.length){
    const char=sql[index],next=sql[index+1];
    if(state==='line-comment'){if(char==='\n')state='normal';index++;continue;}
    if(state==='block-comment'){if(char==='*'&&next==='/'){state='normal';index+=2;}else index++;continue;}
    if(state==='single'||state==='double'||state==='backtick'){
      const quote=state==='single'?"'":state==='double'?'"':'`';
      if(char===quote&&next===quote){index+=2;continue;}
      if(char===quote)state='normal';
      index++;continue;
    }
    if(state==='bracket'){if(char===']')state='normal';index++;continue;}
    if(char==='-'&&next==='-'){acceptWord();state='line-comment';index+=2;continue;}
    if(char==='/'&&next==='*'){acceptWord();state='block-comment';index+=2;continue;}
    if(char==="'"){acceptWord();state='single';index++;continue;}
    if(char==='"'){acceptWord();state='double';index++;continue;}
    if(char==='`'){acceptWord();state='backtick';index++;continue;}
    if(char==='['){acceptWord();state='bracket';index++;continue;}
    if(/[A-Za-z_]/.test(char)){word+=char;index++;continue;}
    acceptWord();
    if(char===';'&&(!trigger||blocks.length===0))finish(index+1);
    index++;
  }
  acceptWord();finish(sql.length);
  return statements;
}
function insertParts(statement){
  const identifier='(?:"(?:[^"]|"")*"|`(?:[^`]|``)*`|\\[[^\\]]+\\]|[A-Za-z_][A-Za-z0-9_$]*)';
  const target=`${identifier}(?:\\s*\\.\\s*${identifier})?`;
  const columns=`(?:\\s*\\(\\s*${identifier}(?:\\s*,\\s*${identifier})*\\s*\\))?`;
  const leading='\\s*(?:(?:--[^\\n]*(?:\\n|$)|\\/\\*[\\s\\S]*?\\*\\/)\\s*)*';
  const conflict='(?:OR\\s+(?:REPLACE|ROLLBACK|ABORT|FAIL|IGNORE)\\s+)?';
  const expression=new RegExp(`^(${leading}INSERT\\s+${conflict}INTO\\s+${target}${columns}\\s+VALUES\\s*)([\\s\\S]*?)(;\\s*)$`,'i');
  const match=String(statement).match(expression);
  return match?{prefix:match[1],values:match[2],suffix:match[3]}:null;
}
function scanDelimited(value,{rows=false}={}){
  const text=String(value),parts=[];let index=0,start=-1,depth=0,state='normal';
  while(index<text.length){
    const char=text[index],next=text[index+1];
    if(state==='single'||state==='double'||state==='backtick'){
      const quote=state==='single'?"'":state==='double'?'"':'`';
      if(char===quote&&next===quote){index+=2;continue;}
      if(char===quote)state='normal';index++;continue;
    }
    if(state==='bracket'){if(char===']')state='normal';index++;continue;}
    if(char==="'"){state='single';index++;continue;}
    if(char==='"'){state='double';index++;continue;}
    if(char==='`'){state='backtick';index++;continue;}
    if(char==='['){state='bracket';index++;continue;}
    if(char==='('){if(depth===0)start=index;depth++;index++;continue;}
    if(char===')'){
      depth--;if(depth<0)throw new Error('EU_D1_IMPORT_INSERT_PARSE_FAILED');
      if(rows&&depth===0){parts.push(text.slice(start,index+1));start=-1;}
      index++;continue;
    }
    if(!rows&&char===','&&depth===0){parts.push(text.slice(start<0?0:start,index).trim());start=index+1;index++;continue;}
    if(rows&&depth===0&&!/[\s,]/.test(char))throw new Error('EU_D1_IMPORT_INSERT_PARSE_FAILED');
    index++;
  }
  if(state!=='normal'||depth!==0)throw new Error('EU_D1_IMPORT_INSERT_PARSE_FAILED');
  if(!rows){parts.push(text.slice(start<0?0:start).trim());if(parts.some(part=>!part))throw new Error('EU_D1_IMPORT_INSERT_PARSE_FAILED');}
  if(rows&&!parts.length)throw new Error('EU_D1_IMPORT_INSERT_PARSE_FAILED');
  return parts;
}
function decodedTextLiteral(value){
  const text=String(value).trim();
  return /^'(?:''|[^'])*'$/s.test(text)?text.slice(1,-1).replaceAll("''", "'"):null;
}
function decodedBlobLiteral(value){
  const text=String(value).trim(),match=text.match(/^[xX]'([0-9a-fA-F]*)'$/s);
  return match&&match[1].length%2===0?match[1]:null;
}
function textChunks(value,maxBytes){
  const chunks=[];let chunk='',size=0;
  for(const char of String(value)){
    const charBytes=byteLength(char);
    if(chunk&&size+charBytes>maxBytes){chunks.push(chunk);chunk='';size=0;}
    chunk+=char;size+=charBytes;
  }
  if(chunk||!chunks.length)chunks.push(chunk);
  return chunks;
}
function stageName(source,sequence){
  const digest=createHash('sha256').update(`${sequence}\0${source}`).digest('hex').slice(0,20);
  return `kp_eu_import_chunks_${digest}`;
}
function externalizedInsert(parts,row,sequence,maxBytes){
  const fields=scanDelimited(row.slice(1,-1)),candidates=[];
  for(let index=0;index<fields.length;index++){
    const text=decodedTextLiteral(fields[index]),blob=decodedBlobLiteral(fields[index]);
    if(text!==null||blob!==null)candidates.push({index,text,blob,size:byteLength(fields[index])});
  }
  candidates.sort((a,b)=>b.size-a.size);
  const selected=[],replacement=[...fields];
  for(const candidate of candidates){
    if(byteLength(`${parts.prefix}(${replacement.join(',')})${parts.suffix}`)<=maxBytes&&candidate.size<=EU_D1_IMPORT_LITERAL_CHUNK_BYTES)break;
    selected.push(candidate);replacement[candidate.index]=`(SELECT ${candidate.text!==null?'text_value':'blob_value'} FROM __STAGE__ WHERE slot=${selected.length})`;
  }
  if(!selected.length||byteLength(`${parts.prefix}(${replacement.join(',')})${parts.suffix}`)>maxBytes)throw new Error('EU_D1_IMPORT_ROW_CANNOT_BE_CHUNKED');
  const name=stageName(row,sequence),identifier=sqlIdentifier(name),statements=[`CREATE TABLE ${identifier}(slot INTEGER PRIMARY KEY,text_value TEXT,blob_value BLOB);`];
  replacement.forEach((value,index)=>{replacement[index]=value.replace('__STAGE__',identifier);});
  selected.forEach((candidate,slotIndex)=>{
    const slot=slotIndex+1;
    if(candidate.text!==null){
      const chunks=textChunks(candidate.text,EU_D1_IMPORT_LITERAL_CHUNK_BYTES);
      statements.push(`INSERT INTO ${identifier}(slot,text_value) VALUES(${slot},${sqlText(chunks[0])});`);
      for(const chunk of chunks.slice(1))statements.push(`UPDATE ${identifier} SET text_value=text_value||${sqlText(chunk)} WHERE slot=${slot};`);
    }else{
      const chunks=(candidate.blob.match(new RegExp(`.{1,${EU_D1_IMPORT_LITERAL_CHUNK_BYTES*2}}`,'g'))||['']);
      statements.push(`INSERT INTO ${identifier}(slot,blob_value) VALUES(${slot},X'${chunks[0]}');`);
      for(const chunk of chunks.slice(1))statements.push(`UPDATE ${identifier} SET blob_value=CAST(blob_value||X'${chunk}' AS BLOB) WHERE slot=${slot};`);
    }
  });
  statements.push(`${parts.prefix}(${replacement.join(',')})${parts.suffix}`,`DROP TABLE ${identifier};`);
  return statements;
}
export function prepareD1Import(value,{maxStatementBytes=EU_D1_IMPORT_STATEMENT_BYTES}={}){
  const source=String(value),output=[];let rewrittenStatements=0,sequence=0;
  for(const statement of splitD1ExportStatements(source)){
    if(byteLength(statement)<=maxStatementBytes){output.push(statement);continue;}
    const parts=insertParts(statement);
    if(!parts)throw new Error(`EU_D1_IMPORT_STATEMENT_TOO_LONG:${byteLength(statement)}`);
    const rows=scanDelimited(parts.values,{rows:true});
    let batch=[];
    const flush=()=>{if(batch.length){output.push(`${parts.prefix}${batch.join(',')}${parts.suffix}`);batch=[];rewrittenStatements++;}};
    for(const row of rows){
      const candidate=`${parts.prefix}${batch.length?[...batch,row].join(','):row}${parts.suffix}`;
      if(byteLength(candidate)<=maxStatementBytes){batch.push(row);continue;}
      flush();
      const single=`${parts.prefix}${row}${parts.suffix}`;
      if(byteLength(single)<=maxStatementBytes){batch=[row];continue;}
      output.push(...externalizedInsert(parts,row,sequence++,maxStatementBytes));rewrittenStatements++;
    }
    flush();
  }
  const sql=`${output.join('\n')}\n`,oversized=splitD1ExportStatements(sql).filter(statement=>byteLength(statement)>maxStatementBytes);
  if(oversized.length)throw new Error(`EU_D1_IMPORT_REWRITE_LIMIT_FAILED:${byteLength(oversized[0])}`);
  return{sql,rewrittenStatements,maxStatementBytes};
}
export function inspectD1Export(value){
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(String(value));
    const integrity=db.prepare('PRAGMA integrity_check;').all().map(row=>String(row.integrity_check));
    if(integrity.length!==1||integrity[0]!=='ok')throw new Error(`EU_D1_EXPORT_INTEGRITY_FAILED:${integrity.join(',')}`);
    const foreignKeyViolations=db.prepare('PRAGMA foreign_key_check;').all();
    if(foreignKeyViolations.length)throw new Error(`EU_D1_EXPORT_FOREIGN_KEY_FAILED:${foreignKeyViolations.length}`);
    const objects=db.prepare("SELECT type,name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name;").all();
    const tables=objects.filter(row=>row.type==='table').map(row=>String(row.name));
    const views=objects.filter(row=>row.type==='view').map(row=>String(row.name));
    const counts={};
    for(const table of tables)counts[table]=Number(db.prepare(`SELECT COUNT(*) n FROM ${sqlIdentifier(table)};`).get().n);
    const migrationNames=tables.includes('d1_migrations')?db.prepare('SELECT name FROM d1_migrations ORDER BY name;').all().map(row=>String(row.name)):[];
    const userIds=tables.includes('users')?db.prepare('SELECT id FROM users ORDER BY id;').all().map(row=>String(row.id)):[];
    return {tables,views,counts,migrationNames,userIds};
  }catch(error){
    if(String(error?.message||'').startsWith('EU_D1_EXPORT_'))throw error;
    throw new Error(`EU_D1_EXPORT_INSPECTION_FAILED:${String(error?.message||error)}`,{cause:error});
  }finally{db.close();}
}
export function freezeTriggerNames(table){
  const suffix=createHash('sha256').update(String(table)).digest('hex').slice(0,20);
  return ['insert','update','delete'].map(action=>`${EU_D1_FREEZE_PREFIX}${action[0]}_${suffix}`);
}
export function freezeSql(tables){
  const statements=['PRAGMA foreign_keys=OFF;'];
  for(const table of tables){
    const [insertName,updateName,deleteName]=freezeTriggerNames(table),target=sqlIdentifier(table);
    statements.push(`CREATE TRIGGER IF NOT EXISTS ${sqlIdentifier(insertName)} BEFORE INSERT ON ${target} BEGIN SELECT RAISE(ABORT,'EU_CUTOVER_SOURCE_FROZEN'); END;`);
    statements.push(`CREATE TRIGGER IF NOT EXISTS ${sqlIdentifier(updateName)} BEFORE UPDATE ON ${target} BEGIN SELECT RAISE(ABORT,'EU_CUTOVER_SOURCE_FROZEN'); END;`);
    statements.push(`CREATE TRIGGER IF NOT EXISTS ${sqlIdentifier(deleteName)} BEFORE DELETE ON ${target} BEGIN SELECT RAISE(ABORT,'EU_CUTOVER_SOURCE_FROZEN'); END;`);
  }
  return `${statements.join('\n')}\n`;
}
export function thawSql(tables){
  return `${tables.flatMap(freezeTriggerNames).map(name=>`DROP TRIGGER IF EXISTS ${sqlIdentifier(name)};`).join('\n')}\n`;
}
export function assertSchemaOnlyTarget({tables,counts,migrationNames,expectedMigrationNames,userIds}){
  const expectedTables=new Set(Object.keys(EU_D1_SCHEMA_ONLY_COUNTS)),actualCounts=new Map(Object.entries(counts||{}).map(([name,count])=>[String(name),Number(count)]));
  for(const table of tables){const count=actualCounts.get(String(table))??0;if(count>0&&!expectedTables.has(String(table)))throw new Error(`EU_D1_TARGET_NOT_EMPTY:${table}:${count}`);}
  for(const [table,expected] of Object.entries(EU_D1_SCHEMA_ONLY_COUNTS))if((actualCounts.get(table)??0)!==expected)throw new Error(`EU_D1_TARGET_SCHEMA_ONLY_COUNT_MISMATCH:${table}:${actualCounts.get(table)??0}:${expected}`);
  const actualMigrations=[...(migrationNames||[])].map(String).sort(),expectedMigrations=[...(expectedMigrationNames||[])].map(String).sort();
  if(JSON.stringify(actualMigrations)!==JSON.stringify(expectedMigrations))throw new Error('EU_D1_TARGET_SCHEMA_ONLY_MIGRATIONS_MISMATCH');
  const actualUsers=[...(userIds||[])].map(String).sort();
  if(JSON.stringify(actualUsers)!==JSON.stringify(EU_D1_SCHEMA_ONLY_USERS))throw new Error('EU_D1_TARGET_SCHEMA_ONLY_USERS_MISMATCH');
  return true;
}
export function resetSchemaSql(tables,views=[]){
  const statements=['PRAGMA foreign_keys=OFF;',...views.map(name=>`DROP VIEW IF EXISTS ${sqlIdentifier(name)};`),...tables.map(name=>`DROP TABLE IF EXISTS ${sqlIdentifier(name)};`)];
  return `${statements.join('\n')}\n`;
}
export function normalizeD1Export(value){
  return String(value).replace(/\r\n/g,'\n').replace(/^--.*$/gm,'').replace(/[ \t]+$/gm,'').replace(/\n{3,}/g,'\n\n').trim();
}
export function exportDigest(value){return createHash('sha256').update(normalizeD1Export(value)).digest('hex');}
export function assertMatchingExports(source,target){
  const sourceDigest=exportDigest(source),targetDigest=exportDigest(target);
  if(sourceDigest!==targetDigest)throw new Error(`EU_D1_EXPORT_MISMATCH:${sourceDigest}:${targetDigest}`);
  return sourceDigest;
}
export function parseWranglerJson(text){
  const clean=String(text||'').replace(/\u001b\[[0-9;]*m/g,'').trim();
  const starts=[clean.indexOf('['),clean.indexOf('{')].filter(x=>x>=0).sort((a,b)=>a-b);
  for(const start of starts){try{return JSON.parse(clean.slice(start));}catch{}}
  throw new Error('WRANGLER_JSON_PARSE_FAILED');
}
export function wranglerRows(value){
  const rows=[],seen=new Set();
  function walk(x){
    if(!x||typeof x!=='object')return;
    if(Array.isArray(x)){for(const item of x)walk(item);return;}
    if(Array.isArray(x.results))for(const row of x.results)if(row&&typeof row==='object'){const key=JSON.stringify(row);if(!seen.has(key)){seen.add(key);rows.push(row);}}
    for(const [key,val] of Object.entries(x))if(key!=='results')walk(val);
  }
  walk(value);return rows;
}