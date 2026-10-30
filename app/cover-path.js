(function(root){'use strict';
const names={t:'track',p:'playlist',u:'user',a:'artist',f:'local'};
function file(key){if(typeof key!=='string'||!/^(?:[tpu]:-?[1-9]\d*_[1-9]\d*|[af]:[a-f0-9]{24})$/.test(key))return '';return names[key[0]]+'-'+key.slice(2)+'.png';}
function key(name){if(typeof name!=='string')return '';const m=/^(track|playlist|user|artist|local)-(.+)\.png$/.exec(name);if(!m)return name;const type=Object.keys(names).find(k=>names[k]===m[1]),candidate=type+':'+m[2];return file(candidate)===name?candidate:'';}
const api={file,key};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VKSoundCoverPath=api;
})(typeof window!=='undefined'?window:globalThis);
