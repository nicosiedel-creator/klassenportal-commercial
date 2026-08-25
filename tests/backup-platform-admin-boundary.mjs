import { strict as assert } from 'node:assert';
import { readTenantRows } from '../dist/portability/db.js';

function fakeDb(queries){
  return {
    prepare(sql){
      queries.push(sql);
      return {
        bind(){return this;},
        async all(){return {results:[]};},
      };
    },
  };
}

const membershipQueries=[];
await readTenantRows(fakeDb(membershipQueries),{
  key:'memberships',table:'memberships',idColumn:'id',tenantColumn:'tenant_id',restoreOrder:25,
  columns:{course_id:{type:'string'},user_id:{required:true,type:'string'},role:{required:true,type:'string'}},
  exportOrderBy:'created_at ASC',
},'tenant_test');
assert.equal(membershipQueries.length,1);
assert.match(membershipQueries[0],/NOT EXISTS \(SELECT 1 FROM users portability_user/,'tenant identity relations must exclude global platform-admin identities');
assert.match(membershipQueries[0],/portability_user\.id = memberships\.user_id/,'the platform-admin exclusion must be correlated to the exported membership user');
assert.match(membershipQueries[0],/portability_user\.is_platform_admin = 1/,'the boundary must only exclude platform admins, not ordinary tenant users');

const tenantUserQueries=[];
await readTenantRows(fakeDb(tenantUserQueries),{
  key:'tenant_users',table:'tenant_users',idColumn:'user_id',tenantColumn:'tenant_id',restoreOrder:24,
  columns:{status:{type:'string'},source:{type:'string'}},exportOrderBy:'user_id ASC',
},'tenant_test');
assert.match(tenantUserQueries[0],/portability_user\.id = tenant_users\.user_id/,'tenant_users portability must obey the same global-admin boundary');

const ordinaryQueries=[];
await readTenantRows(fakeDb(ordinaryQueries),{
  key:'locations',table:'locations',idColumn:'id',tenantColumn:'tenant_id',restoreOrder:10,
  columns:{name:{required:true,type:'string'}},exportOrderBy:'name ASC',
},'tenant_test');
assert.doesNotMatch(ordinaryQueries[0],/is_platform_admin/,'non-user tenant resources must remain unchanged');

console.log('Backup platform-admin portability boundary: OK');
