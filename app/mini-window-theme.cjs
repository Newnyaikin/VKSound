'use strict';
const os=require('node:os');
const {supportsMaterial}=require('./window-theme.cjs');
// Windows 11: DWM owns both the acrylic backing and rounded window corners.
// Do NOT combine a per-pixel layered window with a native material rectangle.
function miniWindowOptions(platform=process.platform,release=os.release()){
 const native=supportsMaterial(platform,release);
 return {transparent:!native,backgroundColor:native?'#11141a':'#00000000',backgroundMaterial:'none',hasShadow:native,roundedCorners:native};
}
function applyMiniWindowTheme(w,theme='dark',platform=process.platform,release=os.release()){
 if(!w||w.isDestroyed())return 'none';
 let material='none';
 try{
  if(supportsMaterial(platform,release)&&typeof w.setBackgroundMaterial==='function'){material=theme==='glass'?'acrylic':'none';w.setBackgroundMaterial(material);}
  if(platform==='darwin'&&typeof w.setVibrancy==='function'){material=theme==='glass'?'vibrancy':'none';w.setVibrancy(material==='vibrancy'?'under-window':null);if(material==='vibrancy')w.setVisualEffectState?.('active');}
  w.setBackgroundColor?.(material!=='none'?'#00000000':supportsMaterial(platform,release)?(theme==='light'?'#f4f6fa':'#11141a'):'#00000000');
  return material;
 }catch{
  try{w.setBackgroundMaterial?.('none');}catch{}try{w.setVibrancy?.(null);}catch{}
  try{w.setBackgroundColor?.(supportsMaterial(platform,release)?'#11141a':'#00000000');}catch{}
  return 'none';
 }
}
module.exports={miniWindowOptions,applyMiniWindowTheme};
