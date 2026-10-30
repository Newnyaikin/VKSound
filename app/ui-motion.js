(function(root){'use strict';
class Motion{
 constructor({reduced=()=>root.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true}={}){this.reduced=reduced;this.pending=new WeakMap();this.reveals=new WeakMap();this.routes=new WeakMap();}
 cancel(dialog){const task=this.pending.get(dialog);if(!task)return;this.pending.delete(dialog);dialog.removeEventListener('close',task.onClose);dialog.inert=task.inert;task.animation?.cancel();task.resolve(false);}
 close(dialog,commit=()=>dialog.close()){
  if(!dialog?.open)return Promise.resolve(false);const previous=this.pending.get(dialog);if(previous)return previous.promise;
  if(this.reduced()||typeof dialog.animate!=='function'){commit();return Promise.resolve(true);}
  const full=dialog.id==='fullPlayer',queue=dialog.id==='queueDialog',style=root.getComputedStyle?.(dialog),from={opacity:style?.opacity||'1',transform:style?.transform||'none'},to={opacity:0,transform:full?'translateY(24px)':queue?'translateX(20px)':'translateY(8px) scale(.985)'};
  const task={inert:dialog.inert};task.promise=new Promise(resolve=>{task.resolve=resolve;});this.pending.set(dialog,task);
  const finish=()=>{if(this.pending.get(dialog)!==task)return;this.pending.delete(dialog);dialog.removeEventListener('close',task.onClose);dialog.inert=task.inert;task.animation?.cancel();if(dialog.open){commit();task.resolve(true);}else task.resolve(false);};
  task.onClose=()=>this.cancel(dialog);dialog.addEventListener('close',task.onClose);dialog.inert=true;
  try{task.animation=dialog.animate([from,to],{duration:full?190:150,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});task.animation.finished.then(finish,finish);}catch{finish();}
  return task.promise;
 }
 reveal(element){if(!element)return;this.reveals.get(element)?.cancel();if(this.reduced()||typeof element.animate!=='function')return;const animation=element.animate([{opacity:.65,transform:'translateY(7px)'},{opacity:1,transform:'none'}],{duration:210,easing:'cubic-bezier(.2,.75,.25,1)'});this.reveals.set(element,animation);animation.finished.catch(()=>{}).finally(()=>{if(this.reveals.get(element)===animation)this.reveals.delete(element);});}
 navigate(element,key,animate=true){if(this.routes.get(element)===key)return;this.routes.set(element,key);if(animate)this.reveal(element);}
}
const api={Motion};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VKSoundMotion=new Motion();
})(typeof window!=='undefined'?window:globalThis);
