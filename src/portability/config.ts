import type { PortabilityConfig, ResourceDefinition } from './types.js';

const r = (x: ResourceDefinition): ResourceDefinition => x;

export const portabilityConfig: PortabilityConfig = {
  tenantTable: 'tenants',
  tenantIdColumn: 'id',
  tenantNameColumn: 'name',
  tenantSlugColumn: 'slug',
  maxImportRows: 10000,
  maxPdfBytes: 25 * 1024 * 1024,
  deleteGraceDays: 14,
  resources: [
    r({
      key: 'locations', table: 'locations', idColumn: 'id', tenantColumn: 'tenant_id', restoreOrder: 10,
      columns: {
        name: { required: true, sourceAliases: ['standort', 'location'], maxLength: 200 },
        address: { sourceAliases: ['adresse'], maxLength: 500 },
      },
      uniqueBy: ['name'], exportOrderBy: 'name',
    }),
    r({
      key: 'courses', table: 'courses', idColumn: 'id', tenantColumn: 'tenant_id', restoreOrder: 20,
      columns: {
        name: { required: true, sourceAliases: ['kurs', 'klasse', 'course'], maxLength: 200 },
        location_id: { sourceAliases: ['standort_id'] },
        start_date: { sourceAliases: ['beginn', 'start'], type: 'date' },
        end_date: { sourceAliases: ['ende'], type: 'date' },
      },
      uniqueBy: ['name'], exportOrderBy: 'name',
    }),
    r({
      key: 'subjects', table: 'subjects', idColumn: 'id', tenantColumn: 'tenant_id', restoreOrder: 30,
      columns: {
        name: { required: true, sourceAliases: ['fach'], maxLength: 200 },
        short_name: { sourceAliases: ['kuerzel', 'kürzel'], maxLength: 40 },
      }, uniqueBy: ['name'], exportOrderBy: 'name',
    }),
    r({
      key: 'teachers', table: 'teachers', idColumn: 'id', tenantColumn: 'tenant_id', restoreOrder: 30,
      columns: {
        name: { required: true, sourceAliases: ['dozent', 'dozentin', 'lehrer'], maxLength: 200 },
        email: { sourceAliases: ['e_mail', 'mail'], maxLength: 320 },
      }, uniqueBy: ['name'], exportOrderBy: 'name',
    }),
    r({
      key: 'lessons', table: 'lessons', idColumn: 'id', tenantColumn: 'tenant_id', restoreOrder: 40,
      columns: {
        course_id: { required: true, sourceAliases: ['kurs_id', 'klasse_id'] },
        subject_id: { sourceAliases: ['fach_id'] },
        teacher_id: { sourceAliases: ['dozent_id'] },
        starts_at: { required: true, sourceAliases: ['beginn', 'start'], type: 'date' },
        ends_at: { sourceAliases: ['ende'], type: 'date' },
        room: { sourceAliases: ['raum'], maxLength: 100 },
      }, exportOrderBy: 'starts_at',
    }),
    r({
      key: 'homework', table: 'homework', idColumn: 'id', tenantColumn: 'tenant_id', restoreOrder: 40,
      columns: {
        course_id: { required: true, sourceAliases: ['kurs_id', 'klasse_id'] },
        title: { required: true, sourceAliases: ['titel', 'hausaufgabe'], maxLength: 300 },
        description: { sourceAliases: ['beschreibung', 'text'], maxLength: 10000 },
        due_at: { sourceAliases: ['faellig', 'fällig', 'faellig_bis'], type: 'date' },
      }, exportOrderBy: 'due_at',
    }),
    r({
      key: 'appointments', table: 'appointments', idColumn: 'id', tenantColumn: 'tenant_id', restoreOrder: 40,
      columns: {
        course_id: { sourceAliases: ['kurs_id', 'klasse_id'] },
        title: { required: true, sourceAliases: ['titel', 'termin'], maxLength: 300 },
        starts_at: { required: true, sourceAliases: ['beginn', 'datum'], type: 'date' },
        ends_at: { sourceAliases: ['ende'], type: 'date' },
        description: { sourceAliases: ['beschreibung'], maxLength: 10000 },
      }, exportOrderBy: 'starts_at',
    }),
    r({
      key: 'announcements', table: 'announcements', idColumn: 'id', tenantColumn: 'tenant_id', restoreOrder: 40,
      columns: {
        course_id: { sourceAliases: ['kurs_id', 'klasse_id'] },
        title: { required: true, sourceAliases: ['titel'], maxLength: 300 },
        body: { required: true, sourceAliases: ['text', 'inhalt'], maxLength: 20000 },
        visible_from: { sourceAliases: ['sichtbar_ab'], type: 'date' },
      }, exportOrderBy: 'visible_from',
    }),
    r({
      key: 'exams', table: 'exams', idColumn: 'id', tenantColumn: 'tenant_id', restoreOrder: 40,
      columns: {
        course_id: { required: true, sourceAliases: ['kurs_id', 'klasse_id'] },
        title: { required: true, sourceAliases: ['titel', 'pruefung', 'prüfung'], maxLength: 300 },
        exam_at: { required: true, sourceAliases: ['datum', 'termin'], type: 'date' },
        topics: { sourceAliases: ['themen'], maxLength: 10000 },
        aids: { sourceAliases: ['hilfsmittel'], maxLength: 5000 },
        visible_to_students: { sourceAliases: ['sichtbar', 'sichtbar_fuer_schueler'], type: 'boolean' },
      }, exportOrderBy: 'exam_at',
    }),
  ],
};

export function resourceByKey(key: string): ResourceDefinition {
  const found = portabilityConfig.resources.find((x) => x.key === key);
  if (!found) throw new Error(`UNKNOWN_RESOURCE:${key}`);
  return found;
}
