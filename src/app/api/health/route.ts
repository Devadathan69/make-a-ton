export function GET() {
  return Response.json({ status: "ok", application: "loopledger", mode: process.env.NEXT_PUBLIC_DATA_MODE ?? "mock", billingImplemented: true });
}
