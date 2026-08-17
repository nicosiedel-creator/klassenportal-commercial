import type { OrgPermission } from './enterprise-access.js';

export type ResponsibilityKind='primary'|'co_responsible'|'deputy';
export const RESPONSIBILITY_KINDS=new Set<ResponsibilityKind>(['primary','co_responsible','deputy']);

export function responsibilityPermissions(kind:ResponsibilityKind):OrgPermission[]{
  if(kind==='primary'||kind==='co_responsible')return ['org.view','org.manage','access.manage','courses.view','courses.manage','content.view','content.manage','participants.view','participants.manage','reports.view'];
  return ['org.view','courses.view','courses.manage','content.view','content.manage','participants.view','participants.manage','reports.view'];
}

export function responsibilityLabel(kind:ResponsibilityKind):string{return kind==='primary'?'Hauptverantwortlich':kind==='co_responsible'?'2. / weitere Verantwortliche':'Vertretung';}
