(function(root){'use strict';
class MixVisualizer{
 constructor(element,{create,raf=fn=>requestAnimationFrame(fn),cancel=id=>cancelAnimationFrame(id)}={}){Object.assign(this,{element,create,raf,cancel});this.bars=[...element.children];this.active=false;this.serial=0;this.frame=null;this.last=-Infinity;}
 setActive(active){active=active===true;if(active===this.active)return;this.active=active;const serial=++this.serial;this.cancel(this.frame);this.frame=null;if(!active){this.rest();return;}Promise.resolve().then(()=>this.create()).then(node=>{if(!this.active||serial!==this.serial)return;this.node=node;this.data=new Uint8Array(node.frequencyBinCount);this.last=-Infinity;const tick=time=>{if(!this.active||serial!==this.serial)return;if(time-this.last>=50){this.last=time;try{node.getByteFrequencyData(this.data);this.draw(this.data);}catch{this.setActive(false);return;}}this.frame=this.raf(tick);};this.frame=this.raf(tick);}).catch(()=>{if(serial===this.serial){this.active=false;this.rest();}});}
 draw(data){const count=this.bars.length;for(let i=0;i<count;i++){const a=Math.floor(Math.pow(i/count,1.6)*data.length*.72),b=Math.max(a+1,Math.floor(Math.pow((i+1)/count,1.6)*data.length*.72));let sum=0;for(let j=a;j<b&&j<data.length;j++)sum+=data[j];const height=.06+.88*Math.sqrt(sum/Math.max(1,b-a)/255);this.bars[i].style.transform='scaleY('+Math.min(1,height).toFixed(3)+')';}}
 rest(){for(let i=0;i<this.bars.length;i++)this.bars[i].style.transform='scaleY('+[.12,.34,.48,.7,.3,.9,.36,.68,.3,.46,.16][i%11]+')';}
 destroy(){this.setActive(false);this.node=null;this.data=null;}
}
if(typeof module!=='undefined'&&module.exports)module.exports={MixVisualizer};else root.VKSoundVisual={MixVisualizer};
})(typeof window!=='undefined'?window:globalThis);
