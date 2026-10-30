'use strict';
const waveComplete=new Set();let liveAnalyser,livePending=false,liveTimer,livePublish=0,liveLast=-1,liveKey='';
function storeWave(key,peaks,complete=false){fx.peaks.delete(key);fx.peaks.set(key,peaks);if(complete)waveComplete.add(key);while(fx.peaks.size>3){const old=fx.peaks.keys().next().value;fx.peaks.delete(old);waveComplete.delete(old);}if(key===current){drawPeaks(peaks);publishPlayerState();}}
async function prepareActualWave(){const source=fx.stream,key=current;if(!key)return;if(fx.peaks.has(key))drawPeaks(fx.peaks.get(key));
 if(!fx.peaks.has(key))waveComplete.delete(key);
 if(waveComplete.has(key)||fx.waveBusy||!source||source.key!==key||source.format==='hls'||!Number.isFinite(audio.duration)||audio.duration<=0||audio.duration>900)return;
 const ticket=++fx.waveTicket,ctrl=new AbortController();fx.waveController=ctrl;fx.waveBusy=true;const timer=setTimeout(()=>ctrl.abort(),20000);
 try{const r=await fetch(source.url,{signal:ctrl.signal,credentials:'omit'});if(!r.ok||Number(r.headers.get('Content-Length'))>24*1024*1024){await r.body?.cancel();return;}const reader=r.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>24*1024*1024)throw Error('Wave size limit');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 if(ctrl.signal.aborted||ticket!==fx.waveTicket||key!==current)return;const raw=new Uint8Array(size);let at=0;for(const chunk of chunks){raw.set(chunk,at);at+=chunk.length;}chunks.length=0;
 const Context=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!Context)return;const ctx=new Context(1,1,11025),decoded=await ctx.decodeAudioData(raw.buffer);
 if(ctrl.signal.aborted||ticket!==fx.waveTicket||key!==current)return;const peaks=VKSoundWaveform.envelope(decoded);if(peaks.length){$('seekWrap').title='Форма сигнала трека (RMS всех каналов)';storeWave(key,peaks,true);}
 }catch{}finally{clearTimeout(timer);if(fx.waveController===ctrl)fx.waveController=null;fx.waveBusy=false;if(key!==current&&current&&!audio.paused)setTimeout(prepareWave,0);}}
async function startLiveWave(){if(livePending||audio.paused||!current)return;livePending=true;try{liveAnalyser=await equalizer.waveformAnalysis();if(!audio.paused&&!liveTimer)liveTimer=setInterval(captureLiveWave,75);}catch{}finally{livePending=false;}}
function stopLiveWave(){clearInterval(liveTimer);liveTimer=null;liveLast=-1;VKSoundSeek.clearLive($('seekWrap'));VKSoundSeek.clearLive($('fullSeekWrap'));}
function captureLiveWave(){if(audio.paused||!current){stopLiveWave();return;}const key=current,time=audio.currentTime,duration=audio.duration;if(!liveAnalyser||!Number.isFinite(duration)||duration<=0)return;if(liveKey===key&&time===liveLast)return;liveKey=key;liveLast=time;
 const data=new Float32Array(liveAnalyser.fftSize);liveAnalyser.getFloatTimeDomainData(data);let energy=0,samples=0;for(const value of data)if(Number.isFinite(value)){energy+=value*value;samples++;}const level=samples?Math.sqrt(energy/samples):0,ratio=time/duration;VKSoundSeek.live($('seekWrap'),level,ratio);if($('fullPlayer').open&&viewedTrackKey()===key)VKSoundSeek.live($('fullSeekWrap'),level,ratio);if(waveComplete.has(key))return;const peaks=fx.peaks.get(key)||Array(100).fill(null);if(!VKSoundWaveform.sample(peaks,time,duration,data))return;fx.peaks.set(key,peaks);while(fx.peaks.size>3){const old=fx.peaks.keys().next().value;fx.peaks.delete(old);waveComplete.delete(old);}
 if(Date.now()-livePublish>500){livePublish=Date.now();storeWave(key,peaks);$('seekWrap').title='Форма сигнала прослушанных участков; остальная часть ещё не проанализирована';}}
audio.addEventListener('playing',()=>{prepareWave();startLiveWave();});audio.addEventListener('loadedmetadata',()=>{if(!audio.paused)prepareWave();});for(const type of ['pause','ended','emptied'])audio.addEventListener(type,stopLiveWave);
window.addEventListener('beforeunload',()=>{stopLiveWave();cancelWave();});
