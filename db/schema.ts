import { sqliteTable,text,integer } from 'drizzle-orm/sqlite-core';
export const cmsDocuments=sqliteTable('cms_documents',{
  id:text('id').primaryKey(),
  document:text('document').notNull(),
  revision:integer('revision').notNull(),
});
