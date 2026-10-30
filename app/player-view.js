'use strict';
const mixVisualizer=new VKSoundVisual.MixVisualizer($('mixVisualizer'),{create:()=>equalizer.analysis()});mixVisualizer.rest();
let fullCoverIdentity='',mixCoverIdentity='',compactTimer,fullReturnFocus,lastMixArtworkKey='';
function updateMixVisual(){
 const inMixQueue=!!current&&Array.isArray(q.keys)&&q.keys.includes(current)&&Array.isArray(mixed)&&mixed.includes(current);if(inMixQueue)lastMixArtworkKey=current;
 const cover=$('mixCover'),remembered=Array.isArray(mixed)&&mixed.includes(lastMixArtworkKey)?db.rows[lastMixArtworkKey]:null,track=inMixQueue?db.rows[current]:remembered;
 const identity=track?.coverKey?[track.coverKey,db.coverBase,db.coverRevision].join('|'):'';
 if(cover){cover.hidden=!identity;if(identity!==mixCoverIdentity){mixCoverIdentity=identity;cover.replaceChildren();if(identity)cover.append(coverArt(track.coverKey,'note'));}}
 const active=!!track&&mixPlayback&&inMixQueue&&!audio.paused&&!uiDormant&&!$('fullPlayer').open&&['home','mix'].includes(route)&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 mixVisualizer?.setActive(active);
}
function resetMixArtwork(){lastMixArtworkKey='';mixCoverIdentity='';$('mixCover')?.replaceChildren();if($('mixCover'))$('mixCover').hidden=true;}
const ARTIST_CHECK_INTERVAL=6*60*60*1000,ARTIST_SUBSCRIPTION_LIMIT=20;
let subscriptionOwner='',artistSubscriptions=[],releaseCheckTimer=0,releaseCheckBusy=false;
function subscriptionStorageKey(){return 'vksound.artist-subscriptions.'+String(db.profile?.id||'guest');}
function loadArtistSubscriptions(){const owner=subscriptionStorageKey();if(owner===subscriptionOwner)return artistSubscriptions;subscriptionOwner=owner;artistSubscriptions=[];try{const raw=JSON.parse(localStorage.getItem(owner)||'[]');if(Array.isArray(raw))artistSubscriptions=raw.slice(0,ARTIST_SUBSCRIPTION_LIMIT).filter(a=>a&&typeof a.id==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(a.id)&&typeof a.name==='string').map(a=>({id:a.id,name:a.name.slice(0,200),trackName:typeof a.trackName==='string'?a.trackName.slice(0,200):a.name.slice(0,200),initialized:a.initialized!==false,seen:Array.isArray(a.seen)?[...new Set(a.seen.filter(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(x)))].slice(0,100):[],checkedAt:Number.isFinite(a.checkedAt)?a.checkedAt:0}));}catch{}return artistSubscriptions;}
function saveArtistSubscriptions(){try{localStorage.setItem(subscriptionStorageKey(),JSON.stringify(artistSubscriptions.slice(0,ARTIST_SUBSCRIPTION_LIMIT)));}catch{toast('Не удалось сохранить подписки на этом устройстве.',true);}}
function isArtistSubscribed(id){return loadArtistSubscriptions().some(a=>a.id===String(id));}
async function toggleArtistPageSubscription(id,name,albums=[]){
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(id)||status.state!=='ready'||!fx.online)return;
 loadArtistSubscriptions();const existing=artistSubscriptions.find(a=>a.id===id);
 if(existing){artistSubscriptions=artistSubscriptions.filter(a=>a.id!==id);saveArtistSubscriptions();renderFeatures();toast('Подписка на релизы отключена.');return;}
 if(artistSubscriptions.length>=ARTIST_SUBSCRIPTION_LIMIT){toast('Можно подписаться максимум на '+ARTIST_SUBSCRIPTION_LIMIT+' исполнителей.',true);return;}
 const releases=Array.isArray(albums)?albums:[],seen=releases.map(x=>String(x.id)).filter(x=>/^[A-Za-z0-9_-]{1,120}$/.test(x));
 artistSubscriptions.unshift({id,name:String(name||'Исполнитель').slice(0,200),trackName:String(name||'Исполнитель').slice(0,200),initialized:releases.length>0,seen:[...new Set(seen)].slice(0,100),checkedAt:Date.now()});
 artistSubscriptions=artistSubscriptions.slice(0,ARTIST_SUBSCRIPTION_LIMIT);saveArtistSubscriptions();renderFeatures();toast('Подписка на релизы «'+String(name||'Исполнитель')+'» включена.',false,'success');scheduleArtistReleaseCheck();
}
function announceArtistRelease(artist,release){const title=release?.title||'Новый релиз';const text='Новый релиз «'+title+'» — '+artist;toast(text,false,'success');try{if(typeof Notification==='function'&&Notification.permission==='granted')new Notification('Новый релиз — '+artist,{body:title});}catch{}}
async function checkArtistReleases(){clearTimeout(releaseCheckTimer);releaseCheckTimer=0;loadArtistSubscriptions();if(releaseCheckBusy||uiDormant||!fx.online||status.state!=='ready'||!artistSubscriptions.length)return;releaseCheckBusy=true;const accountId=db.profile?.id,epoch=fx.epoch,now=Date.now();try{for(const artist of artistSubscriptions.slice(0,ARTIST_SUBSCRIPTION_LIMIT)){if(now-artist.checkedAt<ARTIST_CHECK_INTERVAL)continue;try{const page=await call('artistPage',{id:artist.id,offset:0});if(accountId!==db.profile?.id||epoch!==fx.epoch)return;const releases=(Array.isArray(page.albums)?page.albums:[]).filter(x=>x&&typeof x.id==='string'),ids=releases.map(x=>String(x.id)),fresh=artist.initialized?releases.filter(x=>!artist.seen.includes(String(x.id))):[];if(fresh.length)announceArtistRelease(artist.name,fresh[0]);artist.initialized=true;artist.seen=[...new Set([...ids,...artist.seen])].slice(0,100);artist.checkedAt=Date.now();}catch(e){if(e.code==='CANCELLED')return;}}saveArtistSubscriptions();}finally{releaseCheckBusy=false;scheduleArtistReleaseCheck();}}
function scheduleArtistReleaseCheck(){clearTimeout(releaseCheckTimer);if(uiDormant||!fx.online||status.state!=='ready'||!loadArtistSubscriptions().length)return;releaseCheckTimer=setTimeout(()=>checkArtistReleases().catch(()=>{}),ARTIST_CHECK_INTERVAL);releaseCheckTimer?.unref?.();}
function stopArtistReleaseChecks(){clearTimeout(releaseCheckTimer);releaseCheckTimer=0;}
let fullTrackKey='',fullFollow=true,fullContentMode='queue';
function viewedTrackKey(){return fullFollow?current:fullTrackKey;}
function updateFullTime(){if(!$('fullPlayer').open)return;if(typeof updateCompactTime==='function')updateCompactTime();const active=viewedTrackKey()===current,t=db.rows[viewedTrackKey()],duration=active&&Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:Math.max(0,t?.duration||0),ratio=active&&duration?audio.currentTime/duration:0;$('fullElapsed').textContent=active?format(audio.currentTime):'0:00';$('fullDuration').textContent=format(duration);$('fullSeek').disabled=!active||!duration;$('fullSeek').value=ratio*1000;VKSoundSeek.progress($('fullSeekWrap'),ratio);}
function renderFullPlayer(){const dialog=$('fullPlayer');if(!dialog.open)return;const key=viewedTrackKey(),t=db.rows[key];if(!t){dialog.close();return;}const active=key===current;dialog.querySelector('.full-player-header>span').textContent=active?'Сейчас играет':'Просмотр трека';
 renderCoverBackdrop('fullCoverBackdrop',t);$('fullTitle').textContent=t.title;$('fullArtist').textContent=t.artist;$('fullArtist').disabled=isLocal(key);const identity=[key,t.coverKey,db.coverBase,db.coverRevision].join('|');if(identity!==fullCoverIdentity){fullCoverIdentity=identity;$('fullArt').replaceChildren(t.coverKey?coverArt(t.coverKey,'note'):Object.assign(make('img'),{src:'../assets/icon.svg',alt:''}));VKSoundSeek.bars($('fullSeekWave'),fx.peaks.get(key));}
 $('fullPlay').replaceChildren(icon(active&&!audio.paused?'pause':'play'));$('fullPlay').disabled=!canPlay(t);$('fullPlay').setAttribute('aria-label',active&&!audio.paused?'Пауза':active?'Продолжить':'Воспроизвести трек');$('fullPrev').disabled=!active||$('prev').disabled;$('fullNext').disabled=!active||$('next').disabled;
 $('fullFavorite').hidden=isLocal(key);$('fullFavorite').disabled=isLocal(key)||status.state!=='ready'||((db.pendingAdds||[]).includes(key)&&!personalKey(key));const liked=!!personalKey(key);$('fullFavorite').classList.toggle('liked',liked);$('fullFavorite').setAttribute('aria-pressed',String(liked));$('fullFavorite').querySelector('span').textContent=liked?'В моей музыке':'В мою музыку';$('fullLyrics').disabled=isLocal(key);
 if(fullContentMode==='lyrics'&&fx.lyricKey!==key)loadLyrics(key,fullFollow);updateFullTime();if(typeof renderFullQueue==='function'){renderFullQueue();renderCompactPlayer();}}
function openFullPlayer(key=current,{lyrics=false,playlist=false,follow=key===current}={}){if(!key||!db.rows[key])return;const changed=viewedTrackKey()!==key;fullTrackKey=key;fullFollow=follow;fx.lyricFollow=follow;const dialog=$('fullPlayer');VKSoundMotion.cancel(dialog);const opening=!dialog.open;
 if(opening){fullReturnFocus=document.activeElement;for(const e of document.querySelectorAll('.sidebar,.workspace,#bottomPlayer'))e.inert=true;dialog.show();$('fullClose').focus();}
 if(typeof setFullContentMode==='function')setFullContentMode(lyrics?'lyrics':'queue',{render:false});renderFullPlayer();if(opening||changed||(!lyrics&&!playlist)){if(typeof scrollFullTo==='function')scrollFullTo(0);else $('fullScroll').scrollTop=0;}if(lyrics||playlist)requestAnimationFrame(scrollToLyrics);updateMixVisual();}
function openTrackLyrics(key){openFullPlayer(key,{lyrics:true,follow:key===current});}
for(const element of [$('nowTitle'),document.querySelector('.now-art')]){element.removeAttribute('role');element.removeAttribute('tabindex');element.removeAttribute('title');element.removeAttribute('aria-label');element.onclick=null;element.onkeydown=null;}
$('fullClose').onclick=()=>VKSoundMotion.close($('fullPlayer'));
$('fullPlay').onclick=action(async()=>{const key=viewedTrackKey();if(key===current)await command('toggle');else{await playTrack(key,[key]);fullFollow=true;fx.lyricFollow=true;renderFullPlayer();}});
for(const [id,name] of [['fullPrev','prev'],['fullNext','next']])$(id).onclick=action(()=>command(name));
$('fullSeek').oninput=()=>{if(viewedTrackKey()===current&&Number.isFinite(audio.duration)&&audio.duration>0){audio.currentTime=audio.duration*Number($('fullSeek').value)/1000;VKSoundSeek.progress($('fullSeekWrap'),Number($('fullSeek').value)/1000);publishPlayerState();}};
$('fullFavorite').onclick=action(()=>toggleLibraryHeart(viewedTrackKey()));
function scrollToLyrics(){if(typeof scrollToFullContent==='function'){scrollToFullContent();return;}const scroll=$('fullScroll'),section=$('fullLyricsSection');scroll.scrollTo({top:scroll.scrollTop+section.getBoundingClientRect().top-scroll.getBoundingClientRect().top-24,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
$('fullLyrics').onclick=()=>{setFullContentMode(fullContentMode==='lyrics'?'queue':'lyrics');scrollToFullContent();};
$('fullArtist').onclick=()=>{const t=db.rows[viewedTrackKey()];$('fullPlayer').close();if(t)openArtistTrack(t);};
$('fullPlayer').addEventListener('close',()=>{if(!$('fullPlayer').open){VKSoundMotion.cancel($('fullPlayer'));$('fullPlayer').inert=false;$('fullArt').replaceChildren();renderCoverBackdrop('fullCoverBackdrop',null);fullCoverIdentity='';fx.lyricTicket++;fx.lyricKey='';fx.lyricFollow=false;$('lyricsBody').replaceChildren();for(const e of document.querySelectorAll('.sidebar,.workspace'))e.inert=false;document.querySelector('.player').inert=!bottomPlayer.visible;if(fullReturnFocus?.isConnected&&!fullReturnFocus.closest('[inert]'))fullReturnFocus.focus();else $('main').focus({preventScroll:true});updateMixVisual();if(!uiDormant){render();if(typeof renderExperience==='function')renderExperience();}}});
$('fullPlayer').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();VKSoundMotion.close($('fullPlayer'));}if(e.key==='Tab'){const controls=[...$('fullPlayer').querySelectorAll('button,input')].filter(el=>!el.disabled&&!el.hidden&&el.getClientRects().length);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
$('compact').onchange=()=>{const value=$('compact').checked;db.settings.compact=value;document.documentElement.dataset.compact=String(value);clearTimeout(compactTimer);compactTimer=setTimeout(()=>call('settings',{compact:value}).catch(e=>toast(e.message,true)),200);};
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',updateMixVisual);
audio.addEventListener('play',updateMixVisual);audio.addEventListener('pause',updateMixVisual);audio.addEventListener('ended',updateMixVisual);
window.addEventListener('beforeunload',()=>{mixVisualizer.destroy();stopArtistReleaseChecks();});
window.VKSoundReleaseChecks={check:checkArtistReleases,stop:stopArtistReleaseChecks};
api?.onStatus?.(next=>{if(next?.state==='ready')setTimeout(()=>checkArtistReleases().catch(()=>{}),4500);else if(next?.state==='signedOut'||next?.state==='clearing')stopArtistReleaseChecks();});

updateMixVisual();

