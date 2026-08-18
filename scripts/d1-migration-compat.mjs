import { readFile, writeFile } from 'node:fs/promises';

export const d1TriggerCompatFiles=[
  {path:'migrations/0048_enterprise_hierarchy_sso_scim_api.sql',expectedCases:4},
  {path:'migrations/0057_timetable_hierarchy_targeting.sql',expectedCases:2},
];

export function patchD1TriggerParserSql(sql,expectedCases){
  const source=String(sql||'');
  const count=(source.match(/SELECT CASE WHEN/g)||[]).length;
  const alreadyPatched=(source.match(/SELECT \(CASE WHEN/g)||[]).length;
  if(alreadyPatched!==0)throw new Error(`D1_TRIGGER_COMPAT_SOURCE_ALREADY_PATCHED:${alreadyPatched}`);
  if(count!==expectedCases)throw new Error(`D1_TRIGGER_COMPAT_UNEXPECTED_CASE_COUNT:${count}:${expectedCases}`);
  const patched=source.replace(/SELECT CASE WHEN([\s\S]*?) END;/g,(_match,body)=>`SELECT (CASE WHEN${body} END);`);
  if((patched.match(/SELECT CASE WHEN/g)||[]).length!==0)throw new Error('D1_TRIGGER_COMPAT_UNPATCHED_CASE');
  if((patched.match(/SELECT \(CASE WHEN/g)||[]).length!==expectedCases)throw new Error('D1_TRIGGER_COMPAT_PATCH_COUNT_MISMATCH');
  return patched;
}

export async function withD1MigrationFilesForWorkersBuild(callback,{files=d1TriggerCompatFiles,read=readFile,write=writeFile}={}){
  const originals=[];
  let primaryError=null;
  let result;
  try{
    for(const item of files){
      const original=await read(item.path,'utf8');
      const patched=patchD1TriggerParserSql(original,item.expectedCases);
      await write(item.path,patched,'utf8');
      originals.push({path:item.path,original});
      console.log(`Applied Cloudflare D1 trigger parser compatibility patch: ${item.path}`);
    }
    result=await callback();
  }catch(error){
    primaryError=error;
  }

  const restoreErrors=[];
  for(const item of [...originals].reverse()){
    try{
      await write(item.path,item.original,'utf8');
      console.log(`Restored original migration source after D1 compatibility run: ${item.path}`);
    }catch(error){
      restoreErrors.push(error);
    }
  }

  if(primaryError&&restoreErrors.length)throw new AggregateError([primaryError,...restoreErrors],'D1_TRIGGER_COMPAT_OPERATION_AND_RESTORE_FAILED',{cause:primaryError});
  if(primaryError)throw primaryError;
  if(restoreErrors.length)throw new AggregateError(restoreErrors,'D1_TRIGGER_COMPAT_RESTORE_FAILED');
  return result;
}
