'use strict';
const {randomBytes}=require('node:crypto');
const {mediaURL,AppError}=require('./model.cjs');
class MediaBridge{
 constructor(fetch,{now=Date.now}={}){this.fetch=fetch;this.now=now;this.clear();}
 clear(){this.cap=randomBytes(24).toString('hex');this.resources=new Map();this.lookup=new Map();this.controllers??=new Set();for(const c of this.controllers)c.abort();this.controllers.clear();this.until=0;}
 add(url,hls=false){url=mediaURL(url);const identity=JSON.stringify([url,hls]);let id=this.lookup.get(identity);if(!id){if(this.resources.size>=20000)throw new AppError('HLS','Слишком большой поток.');id=String(this.resources.size);this.resources.set(id,{url,hls});this.lookup.set(identity,id);}return 'volna-media://stream/'+this.cap+'/'+id;}
 create(url,format){this.clear();this.until=this.now()+2*3600000;return this.add(url,format==='hls');}
 rewrite(body,base){if(body.length>2*1024*1024||!body.trimStart().startsWith('#EXTM3U'))throw new AppError('HLS','Неподдерживаемый HLS-поток.');
  // No DRM/key requests. Only unencrypted HLS is implemented in this version.
  if(/^#EXT-X-(?:SESSION-)?KEY:(?!METHOD=NONE(?:,|$))/im.test(body))throw new AppError('ENCRYPTED','Зашифрованный поток в этой версии не поддерживается.');
  if(body.split(/\r?\n/).length>30000)throw new AppError('HLS','Слишком большой плейлист.');
  const local=value=>{const u=new URL(value,base);return this.add(u.href,u.pathname.toLowerCase().endsWith('.m3u8'));};
  return body.split(/\r?\n/).map(line=>{if(!line.trim())return line;if(line[0]==='#')return line.replace(/URI="([^"]+)"/g,(_,uri)=>'URI="'+local(uri)+'"');return local(line.trim());}).join('\n');
 }
 async handle(request){
  let timer,controller,handedOff=false,epoch=this.cap;
  const headers={'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'};
  try{const u=new URL(request.url),parts=u.pathname.split('/').filter(Boolean);if(u.protocol!=='volna-media:'||u.hostname!=='stream'||parts.length!==2||parts[0]!==this.cap||this.now()>this.until)return new Response('',{status:404,headers});if(!['GET','HEAD'].includes(request.method))return new Response('',{status:405,headers});const ref=this.resources.get(parts[1]);if(!ref)return new Response('',{status:404,headers});
   controller=new AbortController();this.controllers.add(controller);timer=setTimeout(()=>controller.abort(),30000);
   let url=ref.url,response;const range=request.headers?.get?.('Range');
   for(let n=0;n<5;n++){
    response=await this.fetch(mediaURL(url),{method:request.method,redirect:'manual',credentials:'omit',signal:controller.signal,headers:range&&!ref.hls?{Range:range}:{}});
    if(epoch!==this.cap)throw new AppError('CANCELLED','Поток отменён.');
    if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('Location');if(!location)throw new Error();url=mediaURL(new URL(location,url).href);await response.body?.cancel();if(n===4)throw new Error();continue;}break;
   }
   if(!response.ok)return new Response('',{status:response.status===416?416:502,headers});
   if(request.method==='HEAD')return new Response(null,{status:response.status,headers});
   const mime=(response.headers.get('Content-Type')||'').toLowerCase();
   if(ref.hls||/mpegurl/.test(mime)||new URL(url).pathname.toLowerCase().endsWith('.m3u8')){const declared=Number(response.headers.get('Content-Length'));if(declared>2097152)throw new Error();const reader=response.body.getReader();let chunks=[],size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2097152){await reader.cancel();throw new Error();}chunks.push(value);}const text=Buffer.concat(chunks).toString('utf8');if(epoch!==this.cap)throw new Error();return new Response(this.rewrite(text,url),{headers:{...headers,'Content-Type':'application/vnd.apple.mpegurl'}});}
   for(const name of ['Content-Type','Content-Length','Content-Range','Accept-Ranges']){const v=response.headers.get(name);if(v)headers[name]=v;}
   const reader=response.body.getReader(),self=this;handedOff=true;clearTimeout(timer);
   const cleanup=()=>self.controllers.delete(controller);
   const stream=new ReadableStream({async pull(out){try{if(epoch!==self.cap)throw new Error();const r=await reader.read();if(epoch!==self.cap)throw new Error();if(r.done){cleanup();out.close();}else out.enqueue(r.value);}catch{cleanup();controller.abort();try{await reader.cancel();}catch{}out.error(new Error('Stream ended'));}},async cancel(){cleanup();controller.abort();try{await reader.cancel();}catch{}}});
   return new Response(stream,{status:response.status,headers});
  }catch{return new Response('',{status:502,headers});}
  finally{clearTimeout(timer);if(controller&&!handedOff)this.controllers.delete(controller);}
 }
}
module.exports={MediaBridge};
