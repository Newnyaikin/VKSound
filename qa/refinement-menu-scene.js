(async()=>{for(let i=0;i<200&&document.documentElement.dataset.qaReady!=='true';i++)await new Promise(r=>setTimeout(r,20));trackMenu(db.rows['7_2']);})();
