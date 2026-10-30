(function(root){'use strict';
class PlaybackGate{
 constructor({now=Date.now,gap=180}={}){this.now=now;this.gap=gap;this.busy=false;this.last=null;this.at=0;}
 async run(name,fn){const t=this.now();if(this.busy||(name===this.last&&t-this.at<this.gap))return false;this.busy=true;this.last=name;this.at=t;try{await fn();return true;}finally{this.busy=false;}}
}
if(typeof module!=='undefined'&&module.exports)module.exports={PlaybackGate};else root.PolkaPlayback={PlaybackGate};
})(typeof window!=='undefined'?window:globalThis);
