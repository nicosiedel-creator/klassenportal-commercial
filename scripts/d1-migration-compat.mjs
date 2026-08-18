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

export async function patchD1MigrationFilesForWorkersBuild(){
  for(const item of d1TriggerCompatFiles){
    const original=await readFile(item.path,'utf8');
    const patched=patchD1TriggerParserSql(original,item.expectedCases);
    await writeFile(item.path,patched,'utf8');
    console.log(`Applied Cloudflare D1 trigger parser compatibility patch: ${item.path}`);
  }
}
