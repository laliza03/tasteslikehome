import { handleApi } from '../../../server/cms.mjs';
import { getRuntime } from '../../../server/runtime-selected';
export const dynamic='force-dynamic';
async function handle(request:Request) {
  try { return await handleApi(request,await getRuntime()); }
  catch(error) {
    console.error('CMS request failed',error instanceof Error?error.message:'Unknown error');
    return Response.json({error:'storage_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
export {handle as GET,handle as POST,handle as PUT};
