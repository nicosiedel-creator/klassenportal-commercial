import fs from 'node:fs';
const html=fs.readFileSync('tmp/vfa13-live-capture/index.html','utf8');
const uniq=a=>[...new Set(a)].sort();
const matches=(re,group=1)=>uniq([...html.matchAll(re)].map(m=>m[group]).filter(Boolean));
const report={
  bytes:Buffer.byteLength(html),
  title:(html.match(/<title>([^<]*)<\/title>/i)||[])[1]||'',
  paths:matches(/(?:location\.pathname\s*(?:===|startsWith\()\s*['"]([^'"]+)|href=['"](\/[^'"#? ]+)/g,1),
  fetchUrls:matches(/fetch\(\s*['"`]([^'"`]+)['"`]/g),
  apiLike:matches(/['"`]((?:\/api\/|\/admin\/|\/umfrage|\/feedback|\/poll|\/teams)[^'"`]*)['"`]/g),
  localStorageKeys:matches(/localStorage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g),
  sessionStorageKeys:matches(/sessionStorage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g),
  ids:matches(/\bid=['"]([^'"]+)['"]/g),
  headings:matches(/<h[1-4][^>]*>([^<]{1,160})<\/h[1-4]>/gi).map(s=>s.replace(/<[^>]+>/g,'').trim()).filter(Boolean),
  dataEndpoints:matches(/data-(?:url|endpoint|href)=['"]([^'"]+)['"]/g),
  hasInlineScript:/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/i.test(html),
  externalScripts:matches(/<script[^>]+src=['"]([^'"]+)['"]/gi),
  externalStyles:matches(/<link[^>]+href=['"]([^'"]+\.css[^'"]*)['"]/gi),
  forms:matches(/<form[^>]+(?:action=['"]([^'"]*)['"])?/gi),
  tokens:{
    adminKey:html.includes('ADMIN_KEY'),
    teamsWebhook:html.includes('TEAMS_WEBHOOK_URL'),
    d1:html.includes('vfa13-feedback')||html.includes('D1')
  }
};
fs.writeFileSync('tmp/vfa13-live-capture/report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
