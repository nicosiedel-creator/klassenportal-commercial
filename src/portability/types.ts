export interface D1PreparedStatementLike { bind(...values: unknown[]): D1PreparedStatementLike; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<{results?:T[]}>; run(): Promise<unknown>; }
export interface D1DatabaseLike { prepare(sql:string):D1PreparedStatementLike; batch(statements:D1PreparedStatementLike[]):Promise<unknown[]>; }
export interface R2ObjectBodyLike { body: ReadableStream<Uint8Array>; size:number; httpMetadata?:{contentType?:string;contentDisposition?:string}; customMetadata?:Record<string,string>; arrayBuffer():Promise<ArrayBuffer>; text():Promise<string>; }
export interface R2ListedObjectLike { key:string; size:number; etag:string; uploaded:Date; }
export interface R2BucketLike { put(key:string,value:ArrayBuffer|ArrayBufferView|string|ReadableStream<Uint8Array>|Blob,options?:{httpMetadata?:{contentType?:string;contentDisposition?:string};customMetadata?:Record<string,string>}):Promise<unknown>; get(key:string):Promise<R2ObjectBodyLike|null>; delete(key:string|string[]):Promise<void>; list(options?:{prefix?:string;cursor?:string;limit?:number}):Promise<{objects:R2ListedObjectLike[];truncated:boolean;cursor?:string}>; }
export interface PortabilityEnv { DB:D1DatabaseLike; FILES:R2BucketLike; }
export type ColumnType='string'|'number'|'boolean'|'date';
export interface ColumnDefinition { sourceAliases?:string[]; required?:boolean; type?:ColumnType; maxLength?:number; }
export interface ResourceDefinition { key:string; table:string; idColumn:string; tenantColumn:string; columns:Record<string,ColumnDefinition>; uniqueBy?:string[]; exportOrderBy?:string; restoreOrder:number; }
export interface PortabilityConfig { resources:ResourceDefinition[]; tenantTable:string; tenantIdColumn:string; tenantNameColumn?:string; tenantSlugColumn?:string; maxImportRows:number; maxPdfBytes:number; deleteGraceDays:number; }
export interface AuthContext { userId:string; role:string; tenantIds?:string[]; isPlatformAdmin?:boolean; }
export interface ImportIssue { row:number; field?:string; message:string; value?:unknown; }
export interface ImportPreview { resource:string; rowsSeen:number; rowsValid:number; rowsInvalid:number; headers:string[]; sample:Record<string,unknown>[]; issues:ImportIssue[]; }
export interface BackupManifest { version:1; backupId:string; tenantId:string; createdAt:string; reason:'manual'|'pre_restore'|'contract_end'|'automatic'; resources:Array<{key:string;objectKey:string;rowCount:number}>; files:Array<{id:string;originalKey:string;backupKey:string;originalName:string;size:number;contentType?:string;uploadedBy?:string;createdAt?:string}>; }
