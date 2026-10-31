export function GET() {
  return Response.json({ status: "ok", application: "loopledger", stage: "starter", billingImplemented: false });
}
