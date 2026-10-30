'use strict';
function showFullWindow(w){if(!w||w.isDestroyed())return;if(w.isMinimized())w.restore();w.show();w.focus();}
module.exports={showFullWindow};
