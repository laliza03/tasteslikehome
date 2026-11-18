import { env } from 'cloudflare:workers';
export async function getRuntime() {
  const bindings=env as unknown as {DB?:D1Database;BUCKET?:R2Bucket;ADMIN_EMAIL?:string};
  const {DB,BUCKET}=bindings;
  return {
    trustedIdentity:true,
    adminEmail:bindings.ADMIN_EMAIL,
    storage:DB&&BUCKET?{
      async load() {
        const row=await DB.prepare('SELECT document, revision FROM cms_documents WHERE id = ?').bind('main').first<{document:string;revision:number}>();
        return row?{document:JSON.parse(row.document),version:row.revision}:null;
      },
      async save(document:{revision:number},version:number|null) {
        const encoded=JSON.stringify(document);
        const result=version===null?
          await DB.prepare('INSERT INTO cms_documents (id,document,revision) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING').bind('main',encoded,document.revision).run():
          await DB.prepare('UPDATE cms_documents SET document = ?, revision = ? WHERE id = ? AND revision = ?').bind(encoded,document.revision,'main',version).run();
        return result.meta.changes===1;
      },
      async putMedia(id:string,bytes:Uint8Array,contentType:string) {
        await BUCKET.put('photos/'+id,bytes,{httpMetadata:{contentType}});
      },
      async getMedia(id:string) {
        const result=await BUCKET.get('photos/'+id);
        return result?{body:result.body,contentType:result.httpMetadata?.contentType||'application/octet-stream'}:null;
      }
    }:null,
  };
}
