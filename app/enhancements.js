'use strict';
let playlistSearch={query:'',items:[],total:0,next:0,busy:false,error:'',ticket:0};
let artistSearch={query:'',items:[],total:0,busy:false,error:'',ticket:0};
function resetPlaylistSearch(){playlistSearch={query:'',items:[],total:0,next:0,busy:false,error:'',ticket:playlistSearch.ticket+1};}
function resetArtistSearch(){artistSearch={query:'',items:[],total:0,busy:false,error:'',ticket:artistSearch.ticket+1};}
async function loadSearchArtists(query,reset=false){
 if(!query||!fx.online||status.state!=='ready')return;
 if(!reset&&(artistSearch.busy||artistSearch.query===query&&artistSearch.loaded))return;
 const ticket=artistSearch.ticket+1,account=db.profile?.id,epoch=fx.epoch;
 artistSearch={query,items:[],total:0,busy:true,error:'',ticket,loaded:false};renderSearchArtists();
 try{
  const r=await call('searchArtists',{query});
  if(ticket!==artistSearch.ticket||account!==db.profile?.id||epoch!==fx.epoch)return;
  await snapshot();
  if(ticket!==artistSearch.ticket||account!==db.profile?.id||epoch!==fx.epoch)return;
  artistSearch.items=r.items;artistSearch.total=r.total;artistSearch.loaded=true;
 }catch(e){if(ticket===artistSearch.ticket&&e.code!=='CANCELLED')artistSearch.error=e.message||'VK не предоставил исполнителей.';}
 finally{if(ticket===artistSearch.ticket){artistSearch.busy=false;renderSearchArtists();}}
}
function renderSearchArtists(){
 const section=$('searchArtistsSection');if(!section)return;const s=artistSearch,matching=s.query===searchState.query,items=matching?s.items:[],show=route==='search'&&!!searchState.query&&(items.length>0||!!s.error||s.busy);section.hidden=!show;const root=$('searchArtistsGrid');if(!show){root.replaceChildren();return;}root.replaceChildren();
 for(const a of items){const card=make('article','media-card media-card-small search-artist-card'),open=button('','search-artist-open',()=>openDetail('artist',a.id,a.name)),art=make('div','media-art');art.append(coverArt(a.coverKey,'user'));open.append(art,make('strong','',a.name),make('small','muted','Исполнитель'));open.disabled=!fx.online||loading;card.append(open,ib('Скопировать ссылку на исполнителя','link',e=>{e.stopPropagation();return copyObjectLink('artist',a.id);},'search-artist-share copy-link-button'));root.append(card);}
 $('searchArtistsCount').textContent=matching&&s.total?String(s.total):'';
 const notice=$('searchArtistsNotice');notice.textContent=!matching?'Ищите исполнителей по названию.':s.error||(s.busy&&!items.length?'Ищем исполнителей в VK…':!s.busy&&!items.length?'Исполнители не найдены.':'');notice.hidden=!notice.textContent;notice.classList.toggle('error',!!s.error);
}
async function loadSearchPlaylists(query,reset=false){if(!query||!fx.online||status.state!=='ready')return;if(!reset&&(playlistSearch.busy||playlistSearch.query!==query))return;
 const ticket=playlistSearch.ticket+1,account=db.profile?.id,epoch=fx.epoch,previous=reset?[]:playlistSearch.items,offset=reset?0:playlistSearch.next;
 playlistSearch={query,items:previous,total:reset?0:playlistSearch.total,next:offset,busy:true,error:'',ticket};renderSearchPlaylists();
 try{const r=await call('searchPlaylists',{query,offset});if(ticket!==playlistSearch.ticket||account!==db.profile?.id||epoch!==fx.epoch)return;
 playlistSearch.items=[...new Map([...previous,...r.items].map(p=>[p.id,p])).values()];playlistSearch.total=r.total;playlistSearch.next=r.nextOffset;
 // Cover keys belong to the main-process registry; refresh its base/revision.
 await snapshot();
 }catch(e){if(ticket===playlistSearch.ticket&&e.code!=='CANCELLED')playlistSearch.error=e.message||'VK не предоставил плейлисты.';}
 finally{if(ticket===playlistSearch.ticket){playlistSearch.busy=false;renderSearchPlaylists();}}
}
function renderSearchPlaylists(){const section=$('searchPlaylistsSection');if(!section)return;const s=playlistSearch,matching=s.query===searchState.query,items=matching?s.items:[],show=route==='search'&&!!searchState.query&&(items.length>0||!!s.error||s.busy);section.hidden=!show;const root=$('searchPlaylistsGrid');if(!show){root.replaceChildren();$('moreSearchPlaylists').hidden=true;return;}root.replaceChildren();
 for(const p of items){const card=button('','search-playlist-card',()=>openArtistAlbum(p.id)),art=make('div','search-playlist-art'),copy=make('div','search-playlist-copy');art.append(coverArt(p.coverKey,'list'));copy.append(make('strong','',p.title),make('small','muted',[p.artist,counted(p.total||0)].filter(Boolean).join(' · ')));card.append(art,copy);card.disabled=!fx.online||loading;root.append(card);}
 $('searchPlaylistsCount').textContent=matching&&s.total?String(s.total):'';const notice=$('searchPlaylistsNotice');notice.textContent=!matching?'Ищите треки и плейлисты одним запросом.':s.error||(s.busy&&!items.length?'Ищем плейлисты в VK…':!s.busy&&!items.length?'Плейлисты не найдены.':'');notice.hidden=!notice.textContent;notice.classList.toggle('error',!!s.error);
 $('moreSearchPlaylists').hidden=!matching||s.busy||s.next>=s.total||!s.next;$('moreSearchPlaylists').disabled=!fx.online||s.busy;
 if(route==='search'&&!searchState.keys.length&&items.length){$('emptyTitle').textContent='Треки не найдены';$('emptyText').textContent='Выше показаны плейлисты по вашему запросу.';}
}
$('moreSearchPlaylists').onclick=()=>loadSearchPlaylists(searchState.query);
for(const [id,kind] of [['cachePath','cache'],['localPath','local']])$(id).onclick=action(async()=>{const result=await call('openDataFolder',{kind});if(result?.path){db.paths??={};db.paths[kind]=result.path;$(id).textContent=result.path;}});
const baseDrawPeaks=drawPeaks;drawPeaks=function(peaks){baseDrawPeaks(peaks);if($('fullPlayer').open&&viewedTrackKey()===current){VKSoundSeek.bars($('fullSeekWave'),peaks);updateFullTime();}};
$('fullSeekWrap').addEventListener('pointerenter',()=>{if(viewedTrackKey()===current)prepareWave();});
