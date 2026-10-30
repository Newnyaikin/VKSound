'use strict';
const path=require('node:path');
// Do not resize/mark as template: Windows must keep the ICO's coloured 32-bit frames.
function trayImage(nativeImage,assets,platform=process.platform){let image=nativeImage.createFromPath(path.join(assets,platform==='win32'?'tray.ico':'tray.png'));if(image.isEmpty())image=nativeImage.createFromPath(path.join(assets,'icon.png'));if(image.isEmpty())throw Error('Tray image missing');image.setTemplateImage(false);return image;}
module.exports={trayImage};
