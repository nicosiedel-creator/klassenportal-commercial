import { strict as assert } from 'node:assert';
import { parseCsv } from '../dist/portability/csv.js';
import { xlsxFromRows } from '../dist/portability/xlsx-export.js';
import { parseXlsx } from '../dist/portability/xlsx.js';
import { simplePdf } from '../dist/portability/pdf.js';
import { createZipStream } from '../dist/portability/zip.js';
import { hashPassword } from '../dist/core/auth.js';
import { publicMaterialDownload, publicOverview, publicPortalMetadata } from '../dist/core/public.js';

const c=parseCsv('Name;Datum\r\nTest;2026-08-14\r\n"A;B";x\r\n');
assert.deepEqual(c.headers,['name','datum']); assert.equal(c.rows.length,2); assert.equal(c.rows[1].name,'A;B');
const x=await xlsxFromRows(['name','wert'],[{name:'Alpha',wert:12},{name:'Beta',wert:'x'}]); assert.ok(x.byteLength>500);
const xp=await parseXlsx(x.buffer.slice(x.byteOffset,x.byteLength+x.byteOffset)); assert.deepEqual(xp.headers,['name','wert']); assert.equal(xp.rows[0].name,'Alpha');
const pdf=simplePdf('Test',Array.from({length:120},(_,i)=>`Zeile ${i+1}`)); assert.ok(new TextDecoder().decode(pdf.slice(0,8)).startsWith('%PDF-1.4'));
const zip=await new Response(createZipStream([{name:'a.txt',body:'Hallo'},{name:'b.txt',body:new TextEncoder().encode('Welt')}])).arrayBuffer(); const z=new Uint8Array(zip); assert.deepEqual([...z.slice(0,4)],[0x50,0x4b,0x03,0x04]);

function fakePortalEnv(courseRow,fixtures={}){
  return {
    DB:{prepare(sql){return {bind(){return {
      async first(){
        if(sql.includes("purpose='learning_material'"))return fixtures.materialRow||null;
        return courseRow;
      },
      async all(){
        if(sql.includes('feature_flags'))return {results:fixtures.features||[{feature_key:'schedule',enabled:1},{feature_key:'homework',enabled:1},{feature_key:'files',enabled:1},{feature_key:'calendar',enabled:1},{feature_key:'reminders',enabled:1},{feature_key:'weekly_overview',enabled:1}]};
        if(sql.includes('FROM lessons'))return {results:fixtures.lessons||[]};
        if(sql.includes('FROM homework'))return {results:fixtures.homework||[]};
        if(sql.includes('FROM appointments'))return {results:fixtures.appointments||[]};
        if(sql.includes('FROM announcements'))return {results:fixtures.announcements||[]};
        if(sql.includes('FROM links'))return {results:fixtures.links||[]};
        if(sql.includes('FROM exams'))return {results:fixtures.exams||[]};
        if(sql.includes("purpose='learning_material'"))return {results:fixtures.materials||[]};
        return {results:[]};
      }
    };}};}},
    FILES:{
      async get(key){if(!fixtures.fileBody||key!==fixtures.fileKey)return null;const bytes=new TextEncoder().encode(fixtures.fileBody);return {body:new Blob([bytes]).stream(),size:bytes.byteLength,etag:'test',uploaded:new Date(),httpMetadata:{contentType:'application/pdf'},arrayBuffer:async()=>bytes.buffer,text:async()=>fixtures.fileBody};},
    },
  };
}
const portalBase={id:'crs_1',tenant_id:'ten_1',name:'VFA 13',code:'vfa13',start_date:null,end_date:null,access_mode:'public',access_code_hash:'must-never-leak',tenant_name:'Bildungsträger',slug:'bildungstraeger',portal_name:'Mein Portal',welcome_text:'Willkommen',logo_url:'/brand/logo/ten_1',primary_color:'#123456',secondary_color:'#234567',background_color:'#f8fafc',white_label:0,locale:'de-DE',timezone:'Europe/Berlin'};
const publicEnv=fakePortalEnv(portalBase,{lessons:[{id:'l1',starts_at:'2099-01-01T08:00:00Z',ends_at:'2099-01-01T09:00:00Z',subject_name:'Verwaltungsrecht',teacher_name:'Frau Test'}],materials:[{id:'mat_1',course_id:'crs_1',title:'Lernblatt',description:'Kapitel 1',original_name:'lernblatt.pdf',content_type:'application/pdf',size_bytes:1234,created_at:'2026-08-16T10:00:00Z'}]});
const meta=await publicPortalMetadata(publicEnv,'bildungstraeger','vfa13');
assert.equal(meta.course.name,'VFA 13'); assert.equal('access_code_hash' in meta.course,false);
const publicData=await publicOverview(publicEnv,'bildungstraeger','vfa13',null);
assert.equal(publicData.accessGrantedBy,'public'); assert.equal(publicData.viewer.authenticated,false); assert.equal('access_code_hash' in publicData.course,false); assert.equal(publicData.lessons[0].teacher_name,'Frau Test');
assert.equal(publicData.materials[0].title,'Lernblatt'); assert.equal('object_key' in publicData.materials[0],false);
assert.equal(publicData.modules.calendar,true); assert.equal(publicData.modules.reminders,true); assert.equal(publicData.modules.weekly_overview,true);

const loginEnv=fakePortalEnv({...portalBase,access_mode:'login'});
await assert.rejects(()=>publicOverview(loginEnv,'bildungstraeger','vfa13',null),/LOGIN_REQUIRED/);
const participant={userId:'usr_1',email:'teilnehmer@example.de',displayName:'Teilnehmer',isPlatformAdmin:false,mustChangePassword:false,tenantRoles:[{tenantId:'ten_1',courseId:'crs_1',role:'participant'}]};
const loginData=await publicOverview(loginEnv,'bildungstraeger','vfa13',participant);
assert.equal(loginData.viewer.role,'participant'); assert.equal(loginData.accessGrantedBy,'login');
const forced={...participant,mustChangePassword:true};
await assert.rejects(()=>publicOverview(loginEnv,'bildungstraeger','vfa13',forced),/LOGIN_REQUIRED/);

const accessHash=await hashPassword('Klasse-1234');
const codeEnv=fakePortalEnv({...portalBase,access_mode:'link_code',access_code_hash:accessHash});
await assert.rejects(()=>publicOverview(codeEnv,'bildungstraeger','vfa13',null,'falsch'),/ACCESS_CODE_REQUIRED/);
const codeData=await publicOverview(codeEnv,'bildungstraeger','vfa13',null,'Klasse-1234');
assert.equal(codeData.accessGrantedBy,'code'); assert.equal(codeData.viewer.authenticated,false);
const tenantAdmin={userId:'usr_admin',email:'admin@example.de',displayName:'Admin',isPlatformAdmin:false,mustChangePassword:false,tenantRoles:[{tenantId:'ten_1',courseId:null,role:'tenant_admin'}]};
const adminPreview=await publicOverview(codeEnv,'bildungstraeger','vfa13',tenantAdmin);
assert.equal(adminPreview.viewer.role,'tenant_admin'); assert.equal(adminPreview.accessGrantedBy,'login');
const hybridEnv=fakePortalEnv({...portalBase,access_mode:'hybrid',access_code_hash:accessHash});
assert.equal((await publicOverview(hybridEnv,'bildungstraeger','vfa13',participant)).accessGrantedBy,'login');
assert.equal((await publicOverview(hybridEnv,'bildungstraeger','vfa13',null,'Klasse-1234')).accessGrantedBy,'code');

const materialEnv=fakePortalEnv({...portalBase,access_mode:'link_code',access_code_hash:accessHash},{fileBody:'Lernstoff',fileKey:'tenants/ten_1/materials/mat_1-lernblatt.pdf',materialRow:{object_key:'tenants/ten_1/materials/mat_1-lernblatt.pdf',original_name:'lernblatt.pdf',content_type:'application/pdf',size_bytes:9},features:[{feature_key:'files',enabled:1}]});
await assert.rejects(()=>publicMaterialDownload(materialEnv,'bildungstraeger','vfa13','mat_1',null,'falsch'),/ACCESS_CODE_REQUIRED/);
const materialResponse=await publicMaterialDownload(materialEnv,'bildungstraeger','vfa13','mat_1',null,'Klasse-1234');
assert.equal(materialResponse.status,200);assert.equal(await materialResponse.text(),'Lernstoff');assert.match(materialResponse.headers.get('content-disposition')||'',/lernblatt\.pdf/);

console.log('Core portability + class portal + learning material tests: OK');
