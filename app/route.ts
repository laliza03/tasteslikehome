import { storefront } from '../server/pages.generated.js';
export async function GET() {
  return new Response(storefront,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}});
}
