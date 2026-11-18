import { admin } from '../../server/pages.generated.js';
export async function GET() {
  return new Response(admin,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});
}
