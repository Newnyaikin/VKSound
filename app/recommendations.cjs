'use strict';
const {AppError,text,keyOf}=require('./model.cjs');
const token=s=>typeof s==='string'&&s.length>0&&s.length<=4096;
function selectSections(catalog){if(!Array.isArray(catalog?.sections))throw new AppError('PROTOCOL','VK не вернул разделы музыкального каталога.');const sections=catalog.sections.filter(s=>token(s.id)&&!/^моя музыка$|^my music$/i.test(s.title||''));const match=s=>/рекомендац|для вас|для тебя|вам понрав|интересн|собрано|recommend|for you/i.test(s.title||'')||/[?&]section=(?:recoms|recommended|recommendations)(?:&|$)/.test(s.url||'');const selected=[...sections.filter(match),...sections.filter(s=>!match(s))];if(!selected.length){const d=sections.find(s=>s.id===catalog.default_section);if(d)selected.push(d);}if(!selected.length)throw new AppError('UNAVAILABLE','VK не указал раздел рекомендаций для этого сеанса.');return selected.slice(0,3);}
function parseSection(data,client,fallbackTitle){if(!data?.section||!Array.isArray(data.section.blocks))throw new AppError('PROTOCOL','VK изменил формат раздела рекомендаций.');const raw=new Map((Array.isArray(data.playlists)?data.playlists:[]).slice(0,500).map(p=>[keyOf(p),p]));const groups=[];const seen=new Set();for(const block of data.section.blocks.slice(0,100)){if(!['music_playlists','playlists'].includes(block.data_type))continue;const ids=Array.isArray(block.playlists_ids)?block.playlists_ids:[];const items=[];for(const id of ids.slice(0,100)){if(seen.size>=120)break;if(typeof id!=='string'||seen.has(id))continue;const p=raw.get(id);if(!p)continue;const row=client.playlistRow(p);if(!row)continue;row.editable=false;items.push(row);seen.add(id);}if(items.length)groups.push({title:text(block.title||block.layout?.title||fallbackTitle,160)||'Рекомендованные плейлисты',items});}return groups;}
// Track lanes are resolved strictly by block IDs, never by the unreferenced audio pool.
function parseTrackSection(data,client,fallbackTitle){
 if(!data?.section||!Array.isArray(data.section.blocks))return [];
 const pool=new Map((Array.isArray(data.audios)?data.audios:[]).slice(0,1000).filter(a=>a&&typeof a==='object').map(a=>[keyOf(a),a]));
 const seen=new Set(),groups=[];
 for(const b of data.section.blocks.slice(0,100)){
  if(!b||!['music_audios','audios'].includes(b.data_type)||!Array.isArray(b.audios_ids))continue;
  const raw=[];for(const key of b.audios_ids.slice(0,100)){if(typeof key!=='string'||seen.has(key)||seen.size>=200||!pool.has(key))continue;seen.add(key);raw.push(pool.get(key));}
  if(!raw.length)continue;const rows=client.register(raw);if(rows.length)groups.push({title:text(b.title||b.layout?.title||fallbackTitle,160)||'Рекомендуемые треки',rows});
 }
 return groups;
}
class Recommendations{
 constructor(client,{now=Date.now,ttl=300000}={}){this.client=client;this.now=now;this.ttl=ttl;this.reset();}
 reset(){this.generation=(this.generation||0)+1;this.cached=null;this.at=0;this.allowed=new Set();this.job=null;}
 load({refresh=false}={}){if(this.job)return this.job;if(!refresh&&this.cached&&this.now()-this.at<this.ttl)return Promise.resolve(this.cached);const generation=this.generation;const check=()=>{if(generation!==this.generation)throw new AppError('CANCELLED','Аккаунт изменился.');};const job=Promise.resolve().then(async()=>{const root=await this.client.call('catalog.getAudio',{need_blocks:0,extended:1});check();const sections=selectSections(root.catalog);const groups=[],trackGroups=[],errors=[];let complete=false;for(const section of sections){try{const data=await this.client.call('catalog.getSection',{section_id:section.id,need_blocks:1,extended:1});check();groups.push(...parseSection(data,this.client,section.title));trackGroups.push(...parseTrackSection(data,this.client,section.title));complete=true;}catch(e){check();if(['AUTH','RATE','NETWORK','ACCESS','CANCELLED'].includes(e.code))throw e;errors.push(e.message);}}check();if(!complete&&errors.length)throw new AppError('UNAVAILABLE','VK не предоставил рекомендованные плейлисты. '+errors[0]);const used=new Set(),trackSeen=new Set();const result={groups:groups.map(g=>({...g,items:g.items.filter(p=>{if(used.has(p.id)||used.size>=120)return false;used.add(p.id);return true;})})).filter(g=>g.items.length),trackGroups:trackGroups.map(g=>({...g,rows:g.rows.filter(t=>{if(trackSeen.has(t.key)||trackSeen.size>=300)return false;trackSeen.add(t.key);return true;})})).filter(g=>g.rows.length),partial:errors.length>0};this.allowed=used;this.cached=result;this.at=this.now();return result;}).finally(()=>{if(generation===this.generation)this.job=null;});this.job=job;return job;}
 has(id){return typeof id==='string'&&this.allowed.has(id)&&this.client.playlistRefs.has(id);}
}
module.exports={Recommendations,selectSections,parseSection,parseTrackSection};
