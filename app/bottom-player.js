(function(root){'use strict';
function shouldShow({started,current,rows,keys}){return !!(started&&current&&rows?.[current]&&keys?.length);}
class BottomPlayer{
 constructor(element,documentElement,{focusTarget=()=>null}={}){this.element=element;this.root=documentElement;this.focusTarget=focusTarget;this.visible=false;this.root.dataset.playerVisible='false';element.inert=true;element.setAttribute('aria-hidden','true');}
 set(want){want=!!want;if(want===this.visible)return;this.visible=want;const el=this.element;
  if(!want&&el.contains(el.ownerDocument.activeElement))this.focusTarget()?.focus({preventScroll:true});
  this.root.dataset.playerVisible=String(want);el.inert=!want||!!el.ownerDocument.getElementById('fullPlayer')?.open;el.setAttribute('aria-hidden',String(!want));
 }
}
const api={BottomPlayer,shouldShow};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VKSoundBottom=api;
})(typeof window!=='undefined'?window:globalThis);
