import { readFileSync, writeFileSync } from 'node:fs';
const sql = readFileSync('src/server/schema.sql', 'utf8');
const out = '// Generated from schema.sql. Do not edit by hand; edit schema.sql and run npm run gen:schema.\nexport const SCHEMA_SQL = `' + sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`;\n';
writeFileSync('src/server/schema.ts', out);
console.log('schema.ts written', out.length, 'bytes');
