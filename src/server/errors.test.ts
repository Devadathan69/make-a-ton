import { expect, it } from 'vitest';
import { body } from './errors';
it('bounds streamed JSON bytes even when the caller omits Content-Length',async()=>{
  const payload='"'+'a'.repeat(100001)+'"';
  const request=new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json'},body:payload});
  expect(request.headers.has('content-length')).toBe(false);
  await expect(body(request)).rejects.toMatchObject({status:413,code:'BODY_TOO_LARGE'});
});
it('parses valid JSON and rejects malformed or missing JSON',async()=>{
  const request=(payload:string)=>new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json'},body:payload});
  expect(await body(request('{"amount":100}'))).toEqual({amount:100});
  await expect(body(request('{'))).rejects.toMatchObject({status:400,code:'INVALID_JSON'});
});
