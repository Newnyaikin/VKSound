(function(root){'use strict';
class RevealCard{
 constructor(element,{raf=fn=>requestAnimationFrame(fn),cancel=id=>cancelAnimationFrame(id),later=(fn,ms)=>setTimeout(fn,ms),clear=id=>clearTimeout(id),reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches}={}){this.element=element;this.raf=raf;this.cancel=cancel;this.later=later;this.clear=clear;this.reduced=reduced;this.visible=false;this.frame=null;this.timer=null;element.hidden=true;element.inert=true;}
 set(want){if(want===this.visible)return;this.visible=want;this.cancel(this.frame);this.clear(this.timer);this.frame=this.timer=null;const e=this.element;if(want){e.hidden=false;e.inert=false;if(this.reduced())e.classList.add('is-visible');else{e.getBoundingClientRect();this.frame=this.raf(()=>{if(this.visible)e.classList.add('is-visible');});}}else{e.inert=true;e.classList.remove('is-visible');if(this.reduced())e.hidden=true;else this.timer=this.later(()=>{if(!this.visible)e.hidden=true;},260);}}
}
const api={RevealCard};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VKSoundCards=api;
})(typeof window!=='undefined'?window:globalThis);
