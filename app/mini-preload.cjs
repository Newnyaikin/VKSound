'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('mini',{state:()=>ipcRenderer.invoke('mini:state'),command:(name,value)=>ipcRenderer.invoke('mini:command',{name,value}),onState:fn=>{const listener=(_e,s)=>fn(s);ipcRenderer.on('mini:state',listener);return()=>ipcRenderer.removeListener('mini:state',listener);}});
