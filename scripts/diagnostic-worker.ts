import { diagnostic } from './diagnostic-result.js';
export default {
  async fetch():Promise<Response>{
    return new Response(diagnostic,{status:200,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
  }
};
