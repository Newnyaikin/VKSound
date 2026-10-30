(function(root){'use strict';
const frequencies=[31,62,125,250,500,1000,2000,4000,8000,16000];
const presets={flat:[0,0,0,0,0,0,0,0,0,0],bass:[6,5,4,2,0,0,0,0,0,0],voice:[-3,-2,-1,0,2,4,3,1,-1,-2],soft:[2,1,0,-1,-1,0,1,2,1,0]};
const bounded=(n,min,max,fallback=0)=>typeof n==='number'&&Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
function normalize(s){return {enabled:s?.enabled===true,preamp:bounded(s?.preamp,-12,0,-4),bands:frequencies.map((_f,i)=>bounded(s?.bands?.[i],-12,12))};}
// Reusable with a real OfflineAudioContext for numerical DSP regression tests.
function buildGraph(context,source){const filters=frequencies.map(f=>{const n=context.createBiquadFilter();n.type='peaking';n.frequency.value=f;n.Q.value=1;return n;}),gain=context.createGain(),wet=context.createGain(),dry=context.createGain();let prev=source;for(const f of filters){prev.connect(f);prev=f;}prev.connect(gain);gain.connect(wet);wet.connect(context.destination);source.connect(dry);dry.connect(context.destination);return {filters,gain,wet,dry};}
function applyGraph(graph,context,settings,smooth=true){const s=normalize(settings),t=context.currentTime;const put=(param,value)=>{if(smooth)param.setTargetAtTime(value,t,.015);else param.value=value;};graph.filters.forEach((f,i)=>put(f.gain,s.enabled?s.bands[i]:0));const headroom=s.enabled?Math.min(s.preamp,-Math.max(0,...s.bands)):0;put(graph.gain.gain,Math.pow(10,headroom/20));put(graph.wet.gain,s.enabled?1:0);put(graph.dry.gain,s.enabled?0:1);}
class Equalizer{
 constructor(audio,Context,{onStatus=()=>{}}={}){this.audio=audio;this.Context=Context;this.onStatus=onStatus;this.settings=normalize();this.error='';this.ready=false;}
 set(s){this.settings=normalize(s);this.update();}
 status(){return {enabled:this.settings.enabled,state:this.error?'error':this.context?.state||'idle',error:this.error};}
 async resume(){try{if(!this.context){if(!this.Context)throw Error('Web Audio недоступен');this.context=new this.Context();this.context.onstatechange=()=>this.onStatus(this.status());}if(!this.ready){this.source=this.source||this.context.createMediaElementSource(this.audio);Object.assign(this,buildGraph(this.context,this.source));this.ready=true;applyGraph(this,this.context,this.settings,false);}if(this.context.state==='suspended')await this.context.resume();if(this.context.state!=='running')throw Error('Аудиоконтекст не запущен');this.error='';this.onStatus(this.status());return true;}catch(e){this.error=e.message||'Ошибка звукового тракта';this.onStatus(this.status());throw e;}}
 async waveformAnalysis(){await this.resume();if(!this.waveAnalyser){this.waveAnalyser=this.context.createAnalyser();this.waveAnalyser.fftSize=2048;this.source.connect(this.waveAnalyser);}return this.waveAnalyser;}
 async analysis(){await this.resume();if(!this.analyser){this.analyser=this.context.createAnalyser();this.analyser.fftSize=256;this.analyser.smoothingTimeConstant=.72;this.source.connect(this.analyser);}return this.analyser;}
 update(){if(this.ready)applyGraph(this,this.context,this.settings);this.onStatus(this.status());}
}
const api={Equalizer,frequencies,presets,normalize,buildGraph,applyGraph};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VKSoundEQ=api;
})(typeof window!=='undefined'?window:globalThis);
