'use strict';
const os=require('node:os');
// Windows material preserves normal resize/maximize; transparent windows are not
// used there. Acrylic is supported only by Windows 11 build 22621 and later.
function supportsMaterial(platform=process.platform,release=os.release()){
 const [major,,build]=release.split('.').map(Number);return platform==='win32'&&(major>10||(major===10&&build>=22621));
}
function windowOptions(platform=process.platform){return {backgroundColor:'#11141a',...(platform==='win32'?{}:{transparent:true})};}
const applied=new WeakMap();
function applyWindowTheme(w,theme,dark=true,platform=process.platform,release=os.release()){
 if(!w||w.isDestroyed())return 'none';const resolved=theme==='system'?(dark?'dark':'light'):theme;
 const material=resolved==='glass'?(supportsMaterial(platform,release)?'acrylic':platform==='darwin'?'vibrancy':'none'):'none';
 const identity=[resolved,material].join(':');if(applied.get(w)===identity)return material;
 try{
  if(supportsMaterial(platform,release)&&w.setBackgroundMaterial)w.setBackgroundMaterial(material==='acrylic'?'acrylic':'none');
  if(platform==='darwin'&&w.setVibrancy){w.setVibrancy(material==='vibrancy'?'under-window':null);if(material==='vibrancy')w.setVisualEffectState?.('active');}
  // On unsupported compositors keep an opaque dark backing: no unblurred desktop
  // behind text, black/transparent holes, or a promise of unsupported native blur.
  w.setBackgroundColor?.(resolved==='glass'&&material!=='none'?'#00000000':resolved==='light'?'#f4f6fa':'#11141a');
  applied.set(w,identity);return material;
 }catch{
  try{w.setBackgroundMaterial?.('none');}catch{}
  try{w.setVibrancy?.(null);}catch{}
  try{w.setBackgroundColor?.(resolved==='light'?'#f4f6fa':'#11141a');}catch{}
  return 'none';
 }
}
module.exports={supportsMaterial,windowOptions,applyWindowTheme};
