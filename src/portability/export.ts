import { portabilityConfig, resourceByKey } from './config.js';
import type { PortabilityEnv } from './types.js';
import { csvEscape, safeFilename, textEncoder } from './utils.js';
import { selectAllByTenant } from './db.js';
import { xlsxFromRows } from './xlsx-export.js';
import { simplePdf } from './pdf.js';
import { createZipStream, type ZipEntry } from './zip.js';
import { listTenantFiles } from './files.js';

function csvOf(headers:string[],rows:Record<string,unknown>[]):Uint8Array { return textEncoder.encode('\uFEFF'+[headers.join(';'),...rows.map(r=>headers.map(h=>csvEscape(r[h])).join(';'))].join('\r\n')); }
function pdfLines(headers:string[],rows:Record<string,unknown>[]):string[]{ return rows.map((r,i)=>`${i+1}. ${headers.map(h=>`${h}: ${String(r[h]??'')}`).join(' | ')}`); }

export async function exportResource(env:PortabilityEnv,tenantId:string,resourceKey:string,format:'csv'|'xlsx'|'pdf'):Promise<Response> {
  const resource=resourceByKey(resourceKey); const rows=await selectAllByTenant(env.DB,resource,tenantId); const headers=[resource.idColumn,resource.tenantColumn,...Object.keys(resource.columns)];
  let body:Uint8Array; let type:string; let ext:string;
  if(format==='xlsx'){body=await xlsxFromRows(headers,rows);type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';ext='xlsx';}
  else if(format==='pdf'){body=simplePdf(`Export ${resourceKey}`,pdfLines(headers,rows));type='application/pdf';ext='pdf';}
  else {body=csvOf(headers,rows);type='text/csv; charset=utf-8';ext='csv';}
  return new Response(body,{headers:{'content-type':type,'content-disposition':`attachment; filename="${safeFilename(resourceKey)}.${ext}"`,'cache-control':'no-store'}});
}

export async function exportTenantZip(env:PortabilityEnv,tenantId:string):Promise<Response> {
  async function* entries():AsyncGenerator<ZipEntry>{
    const tenant=await env.DB.prepare('SELECT * FROM tenants WHERE id=?').bind(tenantId).first<Record<string,unknown>>();
    yield {name:'tenant.json',body:JSON.stringify(tenant??{},null,2)};
    for(const r of portabilityConfig.resources){const rows=await selectAllByTenant(env.DB,r,tenantId);yield{name:`data/${r.key}.csv`,body:csvOf([r.idColumn,r.tenantColumn,...Object.keys(r.columns)],rows)};}
    const files=await listTenantFiles(env,tenantId); for(const f of files){const obj=await env.FILES.get(f.object_key);if(obj)yield{name:`files/${safeFilename(f.original_name)}`,body:obj.body};}
    const audit=await env.DB.prepare('SELECT * FROM portability_audit WHERE tenant_id=? ORDER BY created_at').bind(tenantId).all<Record<string,unknown>>();
    yield {name:'audit-log.json',body:JSON.stringify(audit.results??[],null,2)};
  }
  return new Response(createZipStream(entries()),{headers:{'content-type':'application/zip','content-disposition':`attachment; filename="customer-export-${safeFilename(tenantId)}-${new Date().toISOString().slice(0,10)}.zip"`,'cache-control':'no-store'}});
}
