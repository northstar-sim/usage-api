import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { route } from './service.js';

export function createServer(){
  return http.createServer((req,res)=>{
    let result;
    try { result = route(req.method, req.url); }
    catch { result = {statusCode: 400, body: {error: 'bad_request', message: 'Malformed request.'}}; }
    res.writeHead(result.statusCode, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(result.body));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer().listen(Number(process.env.PORT||8080),'0.0.0.0');
}
