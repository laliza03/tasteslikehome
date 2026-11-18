import {get,put,BlobPreconditionFailedError} from '@vercel/blob';
export async function getRuntime() {
  const configured=Boolean(process.env.BLOB_READ_WRITE_TOKEN||process.env.BLOB_STORE_ID);
  return {
    trustedIdentity:false,
    password:process.env.ADMIN_PASSWORD,
    storage:configured?{
      async load() {
        const result=await get('tasteslikehome/catalog.json',{access:'private',useCache:false});
        if(!result||!result.stream)return null;
        return {document:await new Response(result.stream).json(),version:result.blob.etag};
      },
      async save(document:unknown,version:string|null) {
        try {
          await put('tasteslikehome/catalog.json',JSON.stringify(document),{access:'private',addRandomSuffix:false,contentType:'application/json',allowOverwrite:version!==null,...(version?{ifMatch:version}:{})});
          return true;
        } catch(error) {
          if(error instanceof BlobPreconditionFailedError||error instanceof Error&&error.message.includes('already exists'))return false;
          throw error;
        }
      },
      async putMedia(id:string,bytes:Uint8Array,contentType:string) {
        await put('tasteslikehome/photos/'+id,new Blob([new Uint8Array(bytes)]),{access:'private',addRandomSuffix:false,contentType});
      },
      async getMedia(id:string) {
        const result=await get('tasteslikehome/photos/'+id,{access:'private'});
        return result?.stream?{body:result.stream,contentType:result.blob.contentType||'application/octet-stream'}:null;
      }
    }:null,
  };
}
