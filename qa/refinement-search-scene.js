(async()=>{for(let i=0;i<200&&document.documentElement.dataset.qaReady!=='true';i++)await new Promise(r=>setTimeout(r,20));searchState={query:'missing',keys:[],total:0,next:0};go('search');})();
