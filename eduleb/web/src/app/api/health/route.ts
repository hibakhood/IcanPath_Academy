// Public liveness only. This does not certify database or provider readiness.
export async function GET() {
 return Response.json({status:"ok"},{headers:{"Cache-Control":"no-store"}});
}
