import { result } from './eos-typecheck-result.js';
export default {async fetch():Promise<Response>{return Response.json(result,{headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});}};
